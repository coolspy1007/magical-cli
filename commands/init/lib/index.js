'use strict'
const fs = require('fs')
const path = require('path')

const inquirer = require('inquirer')
const fse = require('fs-extra')
const colors = require('colors')
const semver = require('semver')
const kebabCase = require('kebab-case')  // 转换字符串 abc-def 形式
const ejs = require('ejs')
const glob = require('glob')


const Command = require('@magical-cli/command')
const log = require('@magical-cli/log')
const Package = require('@magical-cli/package')
const { spinnerStart, sleep, formatCmd, execAsync } = require('@magical-cli/tools')

const getProjectTemplate = require('./api/getProjectTemplate')


// function init(projectName, opts, cmd) {
//   // console.log(`init ${projectName}...`)
//   // console.log('options', opts)
//   // console.log(process.env.CLI_TARGET_PATH)
//   // 通过 当前 init 命令对象 cmd 的上级（主命令program）parent 可以取到全局的 options
//   // 但是如果有注册子命令，那通过 parent 获取主命令的 options 就会有问题
//   // console.log('cmd', cmd.parent.opts().targetPath)
// }
// 初始化类型
const TYPE_PROJECT = Symbol('TYPE_PROJECT')  // 项目
const TYPE_COMPONENT = Symbol('TYPE_COMPONENT')  // 组件
// 模板类型
const TEMPLATE_TYPE_NORMAL = Symbol('normal')  // 标准模板
const TEMPLATE_TYPE_CUSTOM = Symbol('custom') // 自定义模板
// 命令白名单，只有白名单中的命令才会被执行
const WHITE_COMMANDS = ['npm', 'yarn', 'cnpm']

function init(argArr) {
  return new InitCommand(argArr)
}

class InitCommand extends Command {
  init() {
    this.projectName = this._args[0]
    this.force = !!this._opts.force
    // console.log('子进程：', process.pid)
    // 如果传入 projectName 则验证是否有效
    if (this.projectName && !this.isValidName(this.projectName)) {
      throw new Error(colors.red('初始化项目名称不合法，请重新输入'))
    }
    log.verbose('projectName', this.projectName)
    log.verbose('force', this.force)
  }

  async exec() {
    // console.log('子进程：',process.pid)
    // console.log(`exec ${this.projectName}... -> ${this.force?'force':''}`)
    try {
      // 初始化准备，获取用户交互数据
      await this.prepare()
      // 下载模板
      await this.downloadTemplate()
      // 安装模板
      await this.handlerInstallTemplate()
      // 执行命令
      // await this.handlerExecCommand()
    } catch (err) {
      if (process.env.LOG_LEVEL === 'verbose') {
        console.log(err)
      } else {
        log.error('', colors.red(err.message ? err.message : err))
      }
      process.exit(1)
      // log.error('', colors.red( err))
    }
  }

  isValidName(name) {
    return /^[a-zA-Z]+([-_][a-zA-Z]+[a-zA-Z0-9]?|\d)*$/.test(name)
  }

  /**
   * init 执行前的准备工作
   * @returns {Promise<void>}
   */
  async prepare() {
    log.verbose('MAGICAL_CLI_API_URL', process.env.MAGICAL_CLI_API_URL)
    // 获取当前工作目录
    const cwd = process.cwd()
    let ifContinue = true
    // 判断当前目录是否为空
    // 如果不为空询问是否继续创建
    if (!this.isDirEmpty(cwd)) {
      // 非强制则需要确认提示
      if (!this.force) {
        ifContinue = (await inquirer.prompt([{
          type: 'confirm',
          name: 'ifBuild',
          default: false,
          message: '当前文件夹不为空，是否继续创建项目？'
        }])).ifBuild
      }

      if (ifContinue) {
        // 如果用户选择继续创建，进行二次确认
        ifContinue = (await inquirer.prompt({
          type: 'confirm',
          name: 'ifClearFolder',
          default: false,
          message: '是否确定清空当前文件夹'
        })).ifClearFolder
        if (ifContinue) {
          await this.emptyDir(cwd)
        }
      }
    }
    if (!ifContinue) {
      process.exit(1)
    } else {
      await this.handlerInitType()
    }
  }

  /**
   * 多模板进行 ejs 渲染
   * @param ignore 不进行渲染的目录 形如 ['node_modules/**','public/**']
   * @param renderData 渲染的数据
   * @returns {Promise<unknown>}
   */
  async ejsRender(ignore, renderData) {
    const dir = process.cwd()
    return new Promise((resolve, reject) => {
      // glob 来匹配需要进行 ejs 渲染的文件
      glob('**', {
        cwd: dir,
        ignore,
        nodir: true  // 不包含文件夹
      }, (err, files) => {
        if (err) {
          reject(err)
        } else {
          resolve(files)
        }
        Promise.all(files.map(file => {
          const filePath = path.join(dir, file)
          return new Promise((resolve1, reject1) => {
            // 对匹配的文件进行 ejs 渲染
            ejs.renderFile(filePath, renderData, {}, (err, str) => {
              if (err) {
                reject1(err)
              } else {
                // 将 ejs 渲染后文本替换对应文件
                fs.writeFileSync(filePath,str)
                resolve1(str)
              }
            })
          })
        }))

      })
    })

  }

  /**
   * 安装模板入口
   * @returns {Promise<void>}
   */
  async handlerInstallTemplate() {
    // console.log(this.checkedProjectTmplate)
    if (this.checkedProjectTmplate) {
      let { type } = this.checkedProjectTmplate
      // 没有模板类型，取默认类型 normal
      if (!type) {
        type = TEMPLATE_TYPE_NORMAL.description
      }
      if (type === TEMPLATE_TYPE_NORMAL.description) {
        // 标准模板安装
        await this.installNormalTemplate()
      } else if (type === TEMPLATE_TYPE_CUSTOM.description) {
        // 自定义模板安装
        await this.installCustomTemplate()
      } else {
        // 未识别的模板类型
        throw new Error('未识别的项目模板类型')
      }
    } else {
      throw new Error('项目模板不存在')
    }
  }

  /**
   * 安装标准模板
   * @returns {Promise<void>}
   */
  async installNormalTemplate() {
    // 拿到下载好的模板缓存目录
    const templatePath = path.resolve(this.templatePackage.getRealCacheFilePath(), 'template')
    // 要拷贝的目录
    const targetPath = process.cwd()
    log.verbose('templatePath', templatePath)
    log.verbose('targetPath', targetPath)
    // fse.ensureDirSync()
    let spinner = spinnerStart('正在安装模板')
    await sleep()
    try {
      // 确保两个目录都存在
      fse.ensureDirSync(templatePath)
      fse.ensureDirSync(targetPath)
      // 拷贝模板到当前目录
      fse.copySync(templatePath, targetPath)
      spinner.stop()
      log.success('', '安装模板成功')
    } catch (err) {
      throw new Error(err)
    } finally {
      spinner.stop()
    }
    // 拷贝后进行 ejs 模板渲染
    const ignore = ['node_modules/**', 'src/**', 'public/**', 'tests/**', '*lock.json'] // 不做渲染的目录
    const { kebabName: name, projectVersion: version } = this.inputProjectInfo
    const renderData = { name, version }
    await this.ejsRender(ignore, renderData)

  }

  /**
   * 执行命令入口
   * @returns {Promise<void>}
   */
  async handlerExecCommand() {
    const { installCommand, startCommand } = this.checkedProjectTmplate
    // 安装依赖
    if (installCommand) {
      log.info('执行命令', installCommand)
      const errorMsg = `安装依赖失败，您可以尝试手动安装`
      const successMsg = `安装依赖成功`
      await this.execCommand(installCommand, errorMsg, successMsg)
      // 启动项目
      if (startCommand) {
        log.info('执行命令', startCommand)
        const errorMsg = `启动项目失败，您可以尝试手动启动`
        const successMsg = `启动项目成功`
        await this.execCommand(startCommand, errorMsg, successMsg)
      }
    }

  }

  // 执行命令
  async execCommand(command, errorMsg, successMsg) {
    // 处理命令
    const { cmd, args } = formatCmd(command)
    if (!cmd || !WHITE_COMMANDS.includes(cmd)) {
      throw new Error('无效的命令：' + command)
    }
    const res = await execAsync(cmd, args, {
      stdio: 'inherit',
      cwd: process.cwd()
    })
    if (res !== 0) {
      throw new Error(errorMsg)
    } else {
      log.success('', successMsg)
    }
  }


  /**
   * 安装自定义模板
   * @returns {Promise<void>}
   */
  async installCustomTemplate() {
    console.log('自定义模板安装')
  }

  /**
   * 下载模板
   * @returns {Promise<void>}
   */
  async downloadTemplate() {
    // console.log(this.projectTemplate, this.inputProjectInfo)
    // 拿到要下载的模板信息
    const { name, version: packageVersion, npmName: packageName } = this.checkedProjectTmplate
    // 实例化 Package 对象
    const templatePkg = new Package({
      targetPath: path.resolve(process.env.CLI_HOME_PATH, 'template'),
      packageName,
      packageVersion
    })
    // console.log(templatePkg.targetPath, templatePkg.packageName, templatePkg.packageVersion)

    // 如果模板存在那么执行下载，不存在则更新

    if (await templatePkg.exists()) {
      const spinner = spinnerStart('正在更新项目模板')
      await sleep()
      try {
        await templatePkg.update()
        spinner.stop()
        log.success('', '更新项目模板成功')
      } catch (err) {
        throw err
      } finally {
        spinner.stop()
      }
    } else {
      const spinner = await spinnerStart('正在下载项目模板')
      await sleep()
      try {
        await templatePkg.install()
        spinner.stop()
        log.success('', '下载项目模板成功')
      } catch (err) {
        throw err
      } finally {
        spinner.stop()
      }
    }

    this.templatePackage = templatePkg


  }

  /**
   * 根据初始化类型，从接口获取对应模板，如果获取不到抛出异常
   * @param type
   * @returns {Promise<*|*[]>}
   */
  async getTemplates(type) {
    if (type === TYPE_PROJECT) {
      const projectTemplate = await getProjectTemplate()
      if (!projectTemplate || projectTemplate.length < 1) {
        throw new Error('项目模板不存在')
      }
      return projectTemplate
    }
    if (type === TYPE_COMPONENT) {
      throw new Error('组件模板不存在')
    }
    return []
  }

  /**
   * 初始化入口，根据不同选项，获取用户交互数据并返回
   * @returns {Promise<*|{}>}
   */
  async handlerInitType() {
    const { type } = await inquirer.prompt([{
      type: 'list',
      name: 'type',
      message: '请选择初始化类型',
      default: TYPE_PROJECT,
      choices: [
        {
          value: TYPE_PROJECT,
          name: '项目'
        },
        {
          value: TYPE_COMPONENT,
          name: '组件'
        }
      ]
    }])
    if (type === TYPE_PROJECT) {
      // 获取用户输入的项目信息
      this.inputProjectInfo = await this.getInputProjectInfo()
      console.log(this.inputProjectInfo)
      // 获取用户选择的项目模板
      this.checkedProjectTmplate = await this.getCheckedProjectTemplate()
    } else if (type === TYPE_COMPONENT) {
      this.inputComponentInfo = await this.getInputComponentInfo()
    }
  }

  /**
   * 获取用户选择的项目模板
   * @returns {Promise<*>}
   */
  async getCheckedProjectTemplate() {
    const projectTemplates = await this.getTemplates(TYPE_PROJECT)
    const { templateName } = await inquirer.prompt([{
      type: 'list',
      name: 'templateName',
      message: '请选择项目模板',
      choices: projectTemplates.map(tmp => ({
        value: tmp.npmName,
        name: tmp.name
      }))
    }])
    return projectTemplates.find(tmp => tmp.npmName === templateName)
  }

  /**
   * 获取项目交互数据
   * @returns {Promise<*>}
   */
  async getInputProjectInfo() {
    const isValidName = this.isValidName
    const promptObjects = []
    // 如果 init 传入参数 projectName，不需要让用户输入
    if (!this.projectName) {
      promptObjects.push({
        type: 'input',
        name: 'projectName',
        default: '',
        message: '请输出项目名称',
        validate: function (input) {
          const done = this.async()
          setTimeout(function () {
            if (!isValidName(input)) {
              done('请输入合法的项目名称')
              return
            }
            done(null, true)
          }, 0)
        },
        filter: v => {
          return v
        }
      })
    }
    promptObjects.push({
      type: 'input',
      name: 'projectVersion',
      default: '1.0.0',
      message: '请输出项目版本号',
      validate: function (input) {
        const done = this.async()
        setTimeout(function () {
          if (!semver.valid(input)) {
            done('请输入合法的版本号')
            return
          }
          done(null, true)
        }, 0)
      },
      filter: input => {
        return semver.valid(input) ? semver.valid(input) : input
      }
    })
    const inputProjectInfo = await inquirer.prompt(promptObjects)
    // 添加一个 packageName : 项目名称转换为 abc-def 格式
    let kebabName = kebabCase(this.projectName)
    inputProjectInfo.kebabName = kebabName.replace(/^-|-(?=-)/g, '')
    return inputProjectInfo
  }

  /**
   * 获取组件交互数据
   * @returns {Promise<{}>}
   */
  async getInputComponentInfo() {
    return {}
  }

  /**
   * 判断传入目录是否为空
   * @param dir
   * @returns {boolean}
   */
  isDirEmpty(dir) {
    const fileList = fs.readdirSync(dir)
    const filterFileList = fileList.filter(file => (
      !file.startsWith('.') && !['node_modules'].includes(file)
    ))
    return !fileList || filterFileList.length < 1
  }

  /**
   * 清空目录
   */
  async emptyDir(cwd) {
    let spinner = spinnerStart('正在尝试清空当前文件夹，请稍候')
    try {
      await fse.emptyDir(cwd)
      spinner.stop()
      log.success('当前文件夹已被清空')
    } catch (err) {
      throw err
    } finally {
      spinner.stop()
    }
  }
}

module.exports = init

