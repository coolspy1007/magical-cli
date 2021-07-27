'use strict'
const socketIo = require('socket.io-client')  // socket 客户端库
const colors = require('colors')
const get = require('lodash/get')
const fse = require('fs-extra')
const inquirer = require('inquirer')
const cp = require('child_process')

const log = require('@magical-cli/log')
const path = require('path')
const service = require('@magical-cli/request')
const fs = require('fs')
const { getPackageJson, spinnerStart } = require('@magical-cli/tools')
const { getOssFiles } = require('./api')

const CONNECT_TIME_OUT = 5 * 1000 // socket 超时时间，5s 连不上自动断开
const TIME_OUT = 5 * 60 // 允许构建时长 5分钟 时间过后自动断开 socket 连接
const WS_SERVER = process.env.MAGICAL_CLI_API_URL ? process.env.MAGICAL_CLI_API_URL : 'http://120.78.206.254:7001'
const SSH_DIR = 'ssh'  // 上传服务器缓存目录
const OSS_PROJECT_DIR = 'oss_project' // 从 oss 下载的文件缓存目录
// const WS_SERVER = 'http://127.0.0.1:7002'


// 解析服务端发送的消息
function parseMsg(msg) {
  const action = get(msg, 'data.action')
  const type = get(msg, 'data.payload.type')
  const message = get(msg, 'data.payload.message')
  return {
    action,
    type,
    message
  }
}

/**
 * socket 日志打印
 * @param msg
 * @param logType
 */
function logSocket(msg, logType = 'info') {
  let { action, message } = parseMsg(msg)
  const logTypeArr = ['success', 'info', 'verbose', 'notice', 'error']
  if (action && message) {
    if (logTypeArr.includes(action)) {
      logType = action
    } else {
      const actionArr = action.split(' ')
      const successArr = ['success', 'finished']
      const failArr = ['error', 'failed']
      const lastWord = actionArr[actionArr.length - 1]
      if (successArr.includes(lastWord)) {
        logType = 'success'
      } else if (failArr.includes(lastWord)) {
        logType = 'error'
      }
    }
  } else {
    action = ''
    message = msg
  }
  if (logType === 'error') {
    message = colors.red(message)
  }
  log[logType](action, message)

}

class CloudBuild {
  constructor(git, { prod, history, buildCmd = 'npm run build' }) {
    this.git = git
    this.buildCmd = buildCmd
    this.prod = prod  // 是否正式版本发布
    this.history = history  // 是否 history 路由模式发布
    this.type = this.git.gitPublish // 静态资源服务器类型
    this.timeout = TIME_OUT
    this.templateFile = null  // 模板文件 默认 index.html
    this.sshUser = null  // 上传模板文件的服务器用户名 默认 root
    this.sshIp = null   // 上传模板文件的服务器域名或IP
    this.sshPath = null   // 上传模板文件的服务器路径
    this.homePath = this.git.homePath // 用户主目录
    this.successLinkMsg = null // 发布成功后生成的链接地址
  }


  /**
   * 处理 socket 连接超时
   * @param fn
   * @param timeout
   */
  doTimeout(fn, timeout) {
    this.timer && clearTimeout(this.timer)
    log.verbose('设置的连接超时时长', `${timeout / 1000} 秒`)
    this.timer = setTimeout(fn, timeout)
  }

  /**
   * 云构建并发布
   * @returns {Promise<void>}
   */
  async publish() {
    // 准备工作
    await this.prepare()
    // 初始化 socket 连接
    await this.init()
    // 开始云构建
    await this.build()
    // history 路由模式发布（上传 index.html 至服务器）
    // 仅在 --history 模式下才会执行
    if (this.type === 'oss' && this.history) {
      await this.historyPublish()
    }
    // 指定服务器
    if (this.type === 'ssh') {
      await this.sshPublish()
    }
    // 当选择发布正式版本时，在成功发布完成后进行收尾工作（打 tag，合并代码到 master，删除开发分支）
    if (this.prod) {
      await this.git.prodEnd()
    }
    // 所有任务完成后打印生成的链接地址
    this.successLinkMsg && logSocket(this.successLinkMsg)
  }

  async sshPublish() {
    await this.getSSHInfo() // 获取上传服务器信息
    await this.uploadProject() //
  }

  async uploadProject() {
    if (this.sshUser && this.sshIp && this.sshPath) {
      log.info(`开始从 OSS 获取项目构建文件`)
      // 请求接口获取 OSS 中项目文件
      const { code, data, message } = await getOssFiles({
        type: this.prod ? 'prod' : 'dev',
        projectName: this.git.name,  // 项目名称
        fileName: this.templateFile  // 要获取的文件名
      })
      // console.log(code, data, message)
      // 成功获取到模板文件
      if (code === 0 && data && data.length > 0) {
        log.success('成功获取到项目构建文件')
        log.info(`开始下载项目构建文件`)
        let spinner
        try {
          spinner = spinnerStart('正在下载项目构建文件')
          // 下载项目构建文件到本地
          for (const file of data) {
            // log.verbose(`项目构建文件地址 ${file.name} url`, file.url)
            await this.downloadFile(file.url, file.name)
          }
          spinner.stop()
          log.success('下载项目构建文件成功')
        } catch (e) {
          // logSocket('下载项目构建文件失败', 'error')
          throw e
        } finally {
          spinner.stop()
        }
        log.info(`开始上传项目构建文件至指定服务器`, `${this.sshIp} -> ${this.sshPath}`)
        // 上传项目构建文件到 服务器
        const downloadProjectDir = path.resolve(this.homePath, OSS_PROJECT_DIR, `${this.git.name}@${this.git.version}`, this.git.name)
        await this.uploadToSSH(downloadProjectDir)
        log.success('上传项目构建文件成功')
      } else {
        logSocket('未获取到项目构建文件', 'error')
      }
    }
  }

  /**
   * history 模式路由发布
   * @returns {Promise<void>}
   */
  async historyPublish() {
    await this.getTemplateInfo() //获取模板文件 index.html 信息
    await this.getSSHInfo() // 获取上传服务器信息
    await this.uploadTemplate()  // 上传模板
  }

  async getTemplateInfo() {
    const { templateFile } = await inquirer.prompt([
      {
        type: 'input',
        name: 'templateFile',
        default: 'index.html',
        message: '请输入要上传的模板文件名，默认是 index.html'
      }
    ])
    log.verbose('模板文件名', templateFile)
    this.templateFile = templateFile
  }

  /**
   * 获取上传文件的服务器信息
   * @returns {Promise<void>}
   */
  async getSSHInfo() {
    const { sshUser, sshIp, sshPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'sshUser',
        default: 'root',
        message: '请输入要上传的服务器用户名，默认是 root'
      },
      {
        type: 'input',
        name: 'sshIp',
        default: '',
        message: '请输入要上传的服务器域名或 IP',
        validate: input => !!input
      },
      {
        type: 'input',
        name: 'sshPath',
        default: '',
        message: '请输入要上传的服务器路径',
        validate: input => !!input
      }
    ])
    log.verbose('ssh config', sshUser, sshIp, sshPath)
    this.sshUser = sshUser
    this.sshIp = sshIp
    this.sshPath = sshPath
  }


  /**
   * 上传模板文件
   * @returns {Promise<void>}
   */
  async uploadTemplate() {
    if (this.sshUser && this.sshIp && this.sshPath) {
      log.info(`开始从 OSS 获取模板文件`)
      // 请求接口获取 OSS 中模板文件
      const { code, data, message } = await getOssFiles({
        type: this.prod ? 'prod' : 'dev',
        projectName: this.git.name,  // 项目名称
        fileName: this.templateFile  // 要获取的文件名
      })
      // console.log(code, data, message)
      // 成功获取到模板文件
      if (code === 0 && data && data.length > 0) {
        const templateUrl = data[0].url
        log.success('成功获取到模板文件')
        log.verbose('模板文件地址 url', templateUrl)
        // 下载模板文件到本地
        const templateFilePath = await this.downloadFile(templateUrl, this.templateFile)
        log.success('模板文件下载成功')
        log.verbose('模板文件存放路径', templateFilePath)
        // 上传模板文件到 服务器
        log.info(`开始上传模板文件至服务器`)
        await this.uploadToSSH(templateFilePath)
        log.success('上传模板文件成功')

      } else {
        logSocket('未获取到模板文件', 'error')
      }
    }
  }

  /**
   * 上传文件或目录至服务器
   * @param path 要上传的文件或目录路径
   * @returns {Promise<void>}
   */
  async uploadToSSH(path) {
    // scp -r .../index.html root@xx.xx.xx.xx:nginx/xx
    const uploadCmd = `scp -r ${path} ${this.sshUser}@${this.sshIp}:${this.sshPath}`
    log.verbose('uploadCmd', uploadCmd)
    const res = await cp.execSync(uploadCmd)
    console.log(res.toString())
  }

  /**
   * 下载文件到本地缓存目录
   * @param url 下载地址
   * @param savePath 文件保存相对路径 index.html js/xxx.js
   * @returns {Promise<string>} 保存的具体路径
   */
  async downloadFile(url, savePath) {
    const file = await service.request(url)
    if (!file) {
      logSocket('下载文件失败，文件 url：' + url, 'error')
      return
    }
    try {
      const downloadDir = path.resolve(this.homePath, OSS_PROJECT_DIR, `${this.git.name}@${this.git.version}`)
      await fse.ensureDir(downloadDir)
      // await fse.emptyDirSync(downloadDir)
      const downloadFilePath = path.join(downloadDir, savePath)
      // console.log('downloadFilePath', downloadFilePath)
      await fse.ensureFile(downloadFilePath)
      // console.log(savePath, fse.pathExistsSync(downloadFilePath))
      fs.writeFileSync(downloadFilePath, file)
      return downloadFilePath
    } catch (error) {
      logSocket('保存文件失败：' + savePath, 'error')
    }

  }

  /**
   * 发布前准备工作，
   * @returns {Promise<void>}
   */
  async prepare() {
    log.info('正在进行云构建前检查')
    this.checkBuildCommand()
    // 如果正式版本发布，需检查 OSS 文件是否已存在，并询问用户是否进行覆盖安装
    if (this.prod) {
      // 请求接口获取 OSS 文件
      const { code, data } = await getOssFiles({
        type: this.prod ? 'prod' : 'dev',
        projectName: this.git.name  // 项目名称
      })
      // 判断当前项目的 OSS 文件是否存在
      if (code === 0 && data && data.length > 0) {
        // 如果存在，则询问用户是否进行覆盖安装
        const cover = (await inquirer.prompt({
          type: 'confirm',
          name: 'cover',
          default: false,
          message: 'OSS 中存在当前项目的正式版本，是否强行覆盖发布？'
        })).cover
        if (!cover) {
          // throw new Error('发布已终止！')
          logSocket('发布已终止！', 'warn')
          process.exit(0)
        }
      }
    }
  }

  /**
   * 检查构建命令
   */
  checkBuildCommand() {
    const buildCmdArr = this.buildCmd.split(' ')
    // 对构建命令做限制，防止输入危险指令
    if (buildCmdArr[0] !== 'npm' && buildCmdArr[0] !== 'cnpm') {
      throw new Error(`无效的命令 ${buildCmdArr}`)
    }
    // 检查 build 命令是否存在 scripts 中
    const lastCmd = buildCmdArr[buildCmdArr.length - 1]
    const pkg = getPackageJson(this.git.dir)
    if (!pkg || !Object.keys(pkg.scripts).includes(lastCmd)) {
      throw new Error(`构建命令不存在 ${buildCmdArr}`)
    }
  }


  /**
   * 云构建任务
   * @returns {Promise<unknown>}
   */
  async build() {
    return new Promise((resolve, reject) => {
      // 发送 build 事件给服务端执行
      this.socket.emit('build')
      // 云构建发布任务过程监听消息
      this.socket.on('build', msg => {
        logSocket(msg)
      })
      // 安装依赖过程监听
      this.socket.on('installing', msg => {
        console.log(msg) // 打印出安装依赖的输出流信息，让用户看到
      })
      // 打包过程监听
      this.socket.on('building', msg => {
        console.log(msg) // 打印出构建过程的输出流信息，让用户看到
      })
      // 监听失败
      this.socket.on('failed', msg => {
        logSocket(msg)
        this._disConnect(this.socket)
        reject(false)
      })
      // 云构建发布任务成功监听
      this.socket.on('success', msg => {
        this.successLinkMsg = msg
        this._disConnect(this.socket)
        resolve(true)
      })
    })
  }

  // 客户端主动断开连接
  _disConnect(socket) {
    clearTimeout(this.timer)
    socket.disconnect()
    socket.close()
  }

  /**
   * 初始化 socket 连接，创建云构建任务
   * 建立握手连接时将 git 仓库及项目相关信息发送给服务端
   * @returns {Promise<unknown>}
   */
  init() {
    return new Promise((resolve, reject) => {
      log.verbose('WS_SERVER', WS_SERVER)
      // 连接 socket 并携带 git 相关信息
      const socket = socketIo(WS_SERVER, {
        query: {
          repo: this.git.remote,
          name: this.git.name,
          branch: this.git.branch,
          version: this.git.version,
          buildCmd: this.buildCmd,
          type: this.type,
          prod: this.prod
        }
      })

      // 连接超时处理
      this.doTimeout(() => {
        this._disConnect(socket)
        logSocket('云构建任务连接超时，自动终止', 'error')
      }, CONNECT_TIME_OUT)
      // 连接成功
      socket.on('connect', () => {
        clearTimeout(this.timer) // 连接成功后清除 timer
        const { id } = socket
        log.success(`云构建任务创建成功，任务ID：${id}`)
        socket.on(id, msg => {
          logSocket(msg)
        })
        resolve()
      })
      // 监听服务端断开连接
      socket.on('disconnect', () => {
        logSocket('云构建任务连接已断开', 'notice')
        this._disConnect(socket)
      })
      // 连接出错
      socket.on('error', (error) => {
        logSocket('云构建任务出错', 'error')
        this._disConnect(socket)
        reject()
      })
      this.socket = socket
    })
  }
}


module.exports = CloudBuild
