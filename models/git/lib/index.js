'use strict'

const fs = require('fs')
const path = require('path')

const simpleGit = require('simple-git')
const fse = require('fs-extra')
const inquirer = require('inquirer')
const terminalLink = require('terminal-link')
const semver = require('semver')

const log = require('@magical-cli/log')
const { readFile, writeFile, spinnerStart } = require('@magical-cli/tools')
const Github = require('./models/Github')
const Gitee = require('./models/Gitee')

const GIT_ROOT_DIR = '.git' // git 缓存文件根目录
const GIT_SERVER_FILE = '.git_server' // 远程仓库平台 缓存文件名
const GIT_TOKEN_FILE = '.git_token' // 远程仓库 token 缓存文件名
const GIT_OWNER_FILE = '.git_owner' // 远程仓库类型 缓存文件名
const GIT_LONGIN_FILE = '.git_login' // 远程仓库登录名 缓存文件名
const GIT_IGNORE_FILE = '.gitignore' // .gitignore 文件名
const GIT_PUBLISH_FILE = '.git_publish'  // 发布平台缓存文件 （OSS）

// 远程仓库平台
const GITHUB = 'github'
const GITEE = 'gitee'

// 远程仓库类型
const REPO_OWNER_USER = 'user'
const REPO_OWNER_ORG = 'org'

// 版本
const VERSION_RELEASE = 'release'
const VERSION_DEVELOP = 'dev'

// 发布平台类型
const GIT_PUBLISH_TYPE = [{
  value: 'oss',
  name: 'OSS'
}, {
  value: 'ssh',
  name: '指定服务器'
}]

const GIT_OWNER_CHOICES = [
  {
    value: REPO_OWNER_USER,
    name: '个人'
  },
  {
    value: REPO_OWNER_ORG,
    name: '组织'
  }
]

const GIT_OWNER_CHOICES_ONLY_USER = [
  {
    value: REPO_OWNER_USER,
    name: '个人'
  }
]

class Git {
  constructor({ name, version, dir }, {
    refreshGitServer = false,
    refreshGitToken = false,
    refreshGitOwner = false,
    refreshGitPublish = false
  }) {
    this.name = name // 项目名称
    this.version = version // 项目版本
    this.dir = dir  // 当前工作目录
    this.git = simpleGit(dir)  // 初始化一个 simple-git 实例，用于 Git 操作
    this.gitServer = null // 远程仓库 GitServer 实例
    this.homePath = null // 用户主目录
    this.user = null // 远程仓库用户信息
    this.orgs = null // 远程仓库组织信息
    this.owner = null // 远程仓库类型  个人 | 组织
    this.login = null // 远程仓库登录名
    this.repo = null //远程仓库名称
    this.branch = null // 本地开发分支
    this.remote = null // 远程版本库地址
    this.gitPublish = null // 发布到哪里 oss ssh
    this.refreshGitServer = refreshGitServer  // 是否强制刷新远程仓库平台
    this.refreshGitToken = refreshGitToken  // 是否强制刷新远程仓库 token
    this.refreshGitOwner = refreshGitOwner  // 是否强制刷新远程仓库类型
    this.refreshGitPublish = refreshGitPublish  // 是否强制刷新发布平台
  }

  async prepare() {
    // 检查用户主目录
    this.checkHomePath()
    // 检查用户远程 git 仓库平台  github | gitee
    await this.checkGitServer()
    // 检查用户远程 git 仓库 token
    await this.checkGitToken()
    // 检查远程仓库用户和组织信息
    await this.checkUserAndOrgs()
    // 检查远程仓库类型及登录名
    await this.checkGitOwner()
    // 获取静态资源服务器类型
    await this.getGitPublish()
    // 检查并创建远程仓库
    await this.checkRepo()
    // 检查并也写入 .gitignore 文件
    this.checkGitIgnore()
    // git 初始化
    await this.init()
  }

  // 代码自动化提交
  async commit() {
    // 生成开发分支
    await this.getCorrectVersion()
    // 检查 stash 区
    await this.checkStash()
    // 检查代码冲突
    await this.checkConflict()
    // 检查未提交代码
    await this.checkNotCommitted()
    // 切换开发分支
    await this.checkoutBranch(this.branch)
    // 拉取远程 master 分支和开发分支代码
    await this.pullRemoteMasterAndBranch()
    // 推送代码至远程开发分支
    await this.pushRemoteRepo(this.branch)
  }

  /**
   * 发布正式版的收尾工作
   * 1、检查 tag，创建、发布新 tag
   * 2、合并开发分支代码到 master
   * 3、推送代码到远程 master 分支
   * 4、删除本地和远程无用的开发分支
   * @returns {Promise<void>}
   */
  async prodEnd() {
    await this.checkTag()
    await this.checkoutBranch('master')  // 切换到 master 分支
    await this.mergeToBranch('master') // 将开发分支代码合并到 master
    await this.pushRemoteRepo('master') // 推送代码至远程master
    await this.deleteLocalBranch(this.branch) // 删除本地开发分支
    await this.deleteRemoteBranch(this.branch) // 删除远程开发分支
  }


  /**
   * 拉取远程 master 分支和开发分支代码
   * @returns {Promise<void>}
   */
  async pullRemoteMasterAndBranch() {
    await this.pullRemoteRepo('master')
    await this.checkConflict()
    log.info('开始检查远程开发分支')
    const remoteBranchVersionList = await this.getRemoteBranchVersionList(VERSION_DEVELOP)
    // 如果存在远程开发分支，则拉取远程开发分支代码
    if (remoteBranchVersionList && remoteBranchVersionList.length > 0) {
      await this.pullRemoteRepo(this.branch)
      await this.checkConflict()
    } else {
      log.info(`不存在远程分支 [${this.branch}]`)
    }
  }


  /**
   * 删除本地分支
   * @param branch
   * @returns {Promise<void>}
   */
  async deleteLocalBranch(branch) {
    log.info('删除本地分支', branch)
    await this.git.deleteLocalBranch(branch) // 删除本地分支
    log.success('成功删除本地分支', branch)
  }

  /**
   * 删除远程分支
   * @param branch
   * @returns {Promise<void>}
   */
  async deleteRemoteBranch(branch) {
    log.info('删除远程分支', branch)
    await this.git.push(['origin', '--delete', branch]) // 删除远程分支
    log.success('成功删除远程分支', branch)
  }

  /**
   * 合并分支
   * @returns {Promise<void>}
   */
  async mergeToBranch(branch) {
    log.info('开始合并代码', `[${this.branch}] -> [${branch}]`)
    await this.git.mergeFromTo(this.branch, branch) // 合并代码
    log.success('成功合并代码', `[${this.branch}] -> [${branch}]`)
  }

  /**
   * 检查 tag 并创建、推送至远程
   * @returns {Promise<void>}
   */
  async checkTag() {
    const releaseBranch = `${VERSION_RELEASE}/${this.version}` // 远程分支名  release/1.1.0
    const versionList = await this.getRemoteBranchVersionList(VERSION_RELEASE)  // 获取远程 release 分支所有版本
    // 如果远程已存在当前项目版本，说明已存在同版本的 tag ，需要先删除，再创建
    if (versionList.includes(this.version)) {
      log.info(`远程 tag：${releaseBranch} 已存在`)
      await this.git.push(['origin', `:refs/tags/${releaseBranch}`])  // 删除 tag
      log.success(`成功删除远程 tag：${releaseBranch}`)
    }
    // 获取本地 tag ，若存在，先删除
    const localTags = await this.git.tags()
    if (localTags.all.includes(releaseBranch)) {
      log.info(`本地 tag：${releaseBranch} 已存在`)
      await this.git.tag(['-d', releaseBranch])  // 删除 tag
      log.success(`成功删除本地 tag：${releaseBranch}`)
    }
    // 创建本地 tag
    await this.git.addTag(releaseBranch)
    log.success(`成功创建本地 tag：${releaseBranch}`)
    await this.git.pushTags('origin')
    log.success(`成功推送 tag：${releaseBranch} 至远程`)
  }

  /**
   * 获取静态资源服务器类型 OSS SSH
   * @returns {Promise<void>}
   */
  async getGitPublish() {
    const gitPublishFile = this.createGitFile(GIT_PUBLISH_FILE)
    let gitPublish = readFile(gitPublishFile)
    if (!gitPublish || this.refreshGitPublish) {
      gitPublish = (await inquirer.prompt([
        {
          type: 'list',
          name: 'gitPublish',
          default: 'oss',
          message: '请选择项目发布的平台',
          choices: GIT_PUBLISH_TYPE
        }
      ])).gitPublish
      writeFile(gitPublishFile, gitPublish)
      log.success('git publish 发布平台写入成功')
    } else {
      log.success('git publish 发布平台获取成功')
    }
    log.verbose('git publish 发布平台', `${gitPublish} -> ${gitPublishFile}`)
    this.gitPublish = gitPublish
    if (!this.gitPublish) {
      throw new Error('未获取到发布平台类型')
    }
  }


  /**
   * 切换分支
   * @param branch
   * @returns {Promise<void>}
   */
  async checkoutBranch(branch) {
    // 获取本地分支列表
    log.info(`正在切换 ${branch} 分支`)
    const localBranchList = await this.git.branchLocal()
    if (localBranchList.all.includes(branch)) {
      await this.git.checkout(branch) // 切换分支
      log.success(`成功切换至 ${branch} 分支`)
    } else {
      await this.git.checkoutLocalBranch(branch) // 创建并切换分支
      log.success(`成功创建并切换至 ${branch} 分支`)
    }
  }

  /**
   * 检查 stash 区 如果有内容就 pop
   * @returns {Promise<void>}
   */
  async checkStash() {
    log.info('检查 stash 记录')
    const stashList = await this.git.stashList()
    if (stashList.all.length > 0) {
      await this.git.stash(['pop'])
      log.success('stash pop 成功')
    }
  }

  /**
   * 获取正确的版本号
   * @returns {Promise<void>}
   */
  async getCorrectVersion() {
    // 获取远程最新发布分支版本号
    const remoteReleaseVersions = await this.getRemoteBranchVersionList(VERSION_RELEASE)
    let releaseVersion = null
    if (remoteReleaseVersions && remoteReleaseVersions.length > 0) {
      releaseVersion = remoteReleaseVersions[0]
    }
    log.verbose('线上最新版本号', releaseVersion)
    // 生成本地开发分支
    const devVersion = this.version
    if (!releaseVersion) {
      // 不存在远程分支版本
      // 直接生成本地开发分支  dev/1.0.0
      this.branch = `${VERSION_DEVELOP}/${devVersion}`
    } else {
      // 存在远程分支版本
      if (semver.gte(devVersion, releaseVersion)) {
        // 当前版本 >= 远程分支版本
        log.info('当前版本 >= 线上版本', `${devVersion} >= ${releaseVersion}`)
        this.branch = `${VERSION_DEVELOP}/${devVersion}`
        // this.version = releaseVersion  // 是否需要此步？
      } else {
        log.info('远程版本 > 当前版本', `${releaseVersion} > ${devVersion}`)
        // 当前版本 <= 远程分支版本
        // 提示用户选择升级版本，版本号模式：大版本 major/中版本 minor/小版本 patch
        const incType = (await inquirer.prompt([
          {
            type: 'list',
            name: 'incType',
            message: '请选择要升级的版本类型',
            default: 'patch',
            choices: [
              {
                value: `patch`,
                name: `小版本 ${releaseVersion} -> ${semver.inc(releaseVersion, 'patch')}`
              },
              {
                value: `minor`,
                name: `中版本 ${releaseVersion} -> ${semver.inc(releaseVersion, 'minor')}`
              },
              {
                value: `major`,
                name: `大版本 ${releaseVersion} -> ${semver.inc(releaseVersion, 'major')}`
              }
            ]
          }
        ])).incType
        const incVersion = semver.inc(releaseVersion, incType)
        this.branch = `${VERSION_DEVELOP}/${incVersion}`
        this.version = incVersion
      }
      // 同步 package.json 版本与远程版本一致
      this.syncPackageJson()
    }
    log.verbose('本地开发分支', this.branch)
  }

  /**
   *  同步 package.json 信息
   */
  syncPackageJson() {
    const packageJsonPath = path.resolve(this.dir, 'package.json')
    const pkg = fse.readJsonSync(packageJsonPath)

    if (pkg && pkg.version !== this.version) {
      pkg.version = this.version
      fse.writeJsonSync(packageJsonPath, pkg, { spaces: 2 }) // 写入 package.json 保持2个空格缩进
    }
  }

  /**
   * 根据分支类型获取远程分支版本号数组，最新的版本排在第一位 [ '1.1.0', '1.0.0' ]
   * 默认获取远程开发分支
   * @param type
   * @returns {Promise<*[]>}
   */
  async getRemoteBranchVersionList(type) {
    // 通过 git ls-remote --ref 获取所有版本分支信息
    const remoteList = await this.git.listRemote(['--refs'])
    let reg
    if (type === VERSION_RELEASE) {
      reg = /.+refs\/tags\/release\/(\d+\.\d+\.\d+)/g
    } else {
      reg = /.+refs\/heads\/dev\/(\d+\.\d+\.\d+)/g
    }
    return remoteList.split('\n').map(item => {
      return item.replace(reg, '$1')
    }).filter(v => semver.valid(v)).sort((a, b) => {
      return semver.gt(a, b) ? -1 : 1
    })
  }

  /**
   * 检查用户主目录
   */
  checkHomePath() {
    if (!this.homePath) {
      if (process.env.CLI_HOME_PATH) {
        this.homePath = process.env.CLI_HOME_PATH // 用户主目录
      } else {
        throw new Error('请检查环境变量 CLI_HOME 配置')
      }
    }
    fse.ensureDirSync(this.homePath)  // 确保用户主目录存在
    // 如果用户主目录不存在，抛出异常
    if (!fs.existsSync(this.homePath)) {
      throw new Error('用户缓存主目录不存在')
    }
    log.verbose('homePath', this.homePath)
  }

  /**
   * 检查用户和组织信息
   * @returns {Promise<void>}
   */
  async checkUserAndOrgs() {
    this.user = await this.gitServer.getUser()
    if (!this.user) {
      throw new Error('用户信息获取失败！')
    }
    log.verbose('user', this.user)
    this.orgs = await this.gitServer.getOrgs(this.user.login)
    if (!this.orgs) {
      throw new Error('组织信息获取失败！')
    }
    log.verbose('orgs', this.orgs)
    log.success(this.gitServer.type + ' 用户和组织信息获取成功')
  }

  // git 初始化
  async init() {
    await this.gitInit() // git init 初始化
    await this.gitAddRemote() // 添加到远程版本库 origin
    await this.gitInitCommit() // 初始化提交
  }

  /**
   * 初始化提交
   * @returns {Promise<void>}
   */
  async gitInitCommit() {
    await this.checkConflict()  // 代码冲突检查
    await this.checkNotCommitted() // 未提交代码检查
    await this.syncMaster()  // 同步代码到远程 master

  }

  /**
   * 检查 master 分支是否存在
   * @returns {Promise<*>}
   */
  async checkMaster() {
    // git ls-remote --refs 获取所有分支引用，可用来判断是否有 master分 支
    const lsRemote = await this.git.listRemote(['--refs'])
    return lsRemote.includes('refs/heads/master')
  }

  /**
   * 同步远程 master 分支
   * @returns {Promise<void>}
   */
  async syncMaster() {
    if (await this.checkMaster()) {
      await this.pullRemoteRepo('master', {
        '--allow-unrelated-histories': null  // 强制将远程和本地 master 关联
      })
    } else {
      // master 分支不存在则拉取远程 master 分支
      await this.pushRemoteRepo('master')
    }
  }

  /**
   * 推送远程分支代码
   * @param branch
   * @returns {Promise<void>}
   */
  async pushRemoteRepo(branch) {
    log.info(`推送代码至远程分支 ${branch} `)
    let spinner
    try {
      spinner = spinnerStart(`正在推送代码至远程 ${branch} 分支...`)
      await this.git.push('origin', branch)
      spinner.stop()
      log.success(`成功推送代码至远程分支 ${branch} `)
    } catch (err) {
      throw err
    } finally {
      spinner.stop()
    }
  }

  /**
   * 拉取远程分支代码
   * @param branch
   * @param options
   * @returns {Promise<void>}
   */
  async pullRemoteRepo(branch, options) {
    log.info(`拉取远程 ${branch} 分支代码`)
    let spinner
    try {
      spinner = spinnerStart(`正在拉取远程 ${branch} 分支代码...`)
      await this.git.pull('origin', branch, options)
      spinner.stop()
      log.success(`成功拉取远程 ${branch} 分支代码`)
    } catch (err) {
      throw err
    } finally {
      spinner.stop()
    }
  }

  /**
   * 未提交代码检查并提交
   * @returns {Promise<void>}
   */
  async checkNotCommitted() {
    const { not_added, created, deleted, modified, renamed } = await this.git.status()
    let isHasNotCommitted = false
    if (not_added.length > 0) {
      isHasNotCommitted = true
      await this.git.add(not_added)
    }
    if (created.length > 0) {
      isHasNotCommitted = true
      await this.git.add(created)
    }
    if (deleted.length > 0) {
      isHasNotCommitted = true
      await this.git.add(deleted)
    }

    if (modified.length > 0) {
      isHasNotCommitted = true
      await this.git.add(modified)
    }

    if (renamed.length > 0) {
      isHasNotCommitted = true
      await this.git.add(renamed)
    }
    if (isHasNotCommitted) {
      const commitMsg = (await inquirer.prompt([{
        type: 'input',
        name: 'commitMsg',
        default: '',
        message: '请输入本次 commit 信息',
        validate: input => !!input
      }])).commitMsg
      await this.git.commit(commitMsg)
      log.success('本次 commit 提交成功')
    }

  }

  /**
   * 代码冲突检查
   * @returns {Promise<void>}
   */
  async checkConflict() {
    log.info('开始代码冲突检查')
    // 获取到当前 git 状态
    const status = await this.git.status()
    // console.log(status)
    if (status.conflicted.length > 0) {
      throw new Error('当前代码存在冲突，请手动处理后再试')
    }

  }

  /**
   * git init
   * @returns {Promise<void>}
   */
  async gitInit() {
    const gitPath = path.resolve(this.dir, GIT_ROOT_DIR)
    if (!fs.existsSync(gitPath)) {
      log.info('执行 git init 初始化')
      try {
        await this.git.init(this.dir)
      } catch (e) {
        throw new Error('git init 初始化失败')
      }
      log.success('git init 初始化成功')
    }
  }

  /**
   * 添加到远程版本库 origin
   * @returns {Promise<void>}
   */
  async gitAddRemote() {
    const remotes = await this.git.getRemotes()
    // 如果 remotes 中没有 origin 则添加
    if (!remotes || !remotes.find(remote => remote.name === 'origin')) {
      log.info('添加 git remote')
      try {
        await this.git.addRemote('origin', this.remote)
      } catch (e) {
        throw new Error('添加 remote origin 失败')
      }
      log.success('添加 remote origin 成功')
    }
    log.verbose('git remotes', remotes)
  }

  /**
   * 检查 .gitignore
   */
  checkGitIgnore() {
    const gitignoreFile = path.resolve(this.dir, GIT_IGNORE_FILE)
    if (!fs.existsSync(gitignoreFile)) {
      // const ignoreTemplate = readFile(path.resolve(__dirname, GIT_IGNORE_FILE))
      const ignoreTemplate =
`.DS_Store
node_modules
/dist

# local env files
.env.local
.env.*.local

# Log files
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
logs
*.log

# Editor directories and files
.idea
.vscode
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
`
      const res = writeFile(gitignoreFile, ignoreTemplate)
      if (res) {
        log.success('.gitignore 文件写入成功')
      } else {
        log.error('.gitignore 文件写入失败')
      }
    }
  }

  /**
   * 检查并创建远程仓库
   * @returns {Promise<void>}
   */
  async checkRepo() {
    // 获取项目名称对应的仓库信息
    const repo = await this.gitServer.getRepo(this.login, this.name)
    if (!repo) {
      let spinner = spinnerStart(`开始创建远程仓库：${this.name}`)
      try {
        if (this.owner === REPO_OWNER_USER) {
          await this.gitServer.createRepo(this.name)
          // console.log(res)
        } else {
          await this.gitServer.createOrgRepo(this.login, this.name)
        }
        spinner.stop()
        log.success(`创建远程 ${this.gitServer.type} 仓库 ${this.name} 成功 `)
      } catch (err) {
        throw new Error(`创建远程 ${this.gitServer.type} 仓库 ${this.name} 失败 `)
      } finally {
        spinner.stop()
      }
    } else {
      log.success(`获取远程 ${this.gitServer.type} 仓库 ${this.name} 信息成功 `)
    }
    this.repo = repo
    log.verbose(`repo`, repo)
  }

  /**
   * 检查远程仓库类型与登录名
   * @returns {Promise<void>}
   */
  async checkGitOwner() {
    // 创建缓存文件并读取 owner 和 login 信息
    const gitOwnerFile = this.createGitFile(GIT_OWNER_FILE)
    const gitLoginFile = this.createGitFile(GIT_LONGIN_FILE)
    let owner = readFile(gitOwnerFile)
    let login = readFile(gitLoginFile)
    if (!owner || !login || this.refreshGitOwner) {
      owner = (await inquirer.prompt([
        {
          type: 'list',
          name: 'owner',
          default: REPO_OWNER_USER,
          message: '请选择远程仓库类型',
          choices: this.orgs.length > 0 ? GIT_OWNER_CHOICES : GIT_OWNER_CHOICES_ONLY_USER
        }
      ])).owner
      if (owner === 'user') {
        login = this.user.login
      } else {
        login = (await inquirer.prompt([
          {
            type: 'list',
            name: 'login',
            default: this.orgs[0].login,
            message: '请选择组织',
            choices: this.orgs.map(org => ({
              value: org.login,
              name: org.login
            }))
          }
        ])).login
      }
      writeFile(gitOwnerFile, owner)
      log.success('git owner 写入成功')
      writeFile(gitLoginFile, login)
      log.success('git login 写入成功')
    } else {
      log.success('git owner 获取成功')
      log.success('git login 获取成功')
    }
    log.verbose('git owner', `${owner}->${gitOwnerFile}`)
    log.verbose('git login', `${login}->${gitLoginFile}`)
    this.owner = owner
    this.login = login
    if (!this.owner) {
      throw new Error('未获取到远程仓库类型')
    }
    if (!this.login) {
      throw new Error('未获取到远程仓库登录名')
    }
    // 获取远程仓库地址
    this.remote = this.gitServer.getRemote(this.login, this.name)
  }

  /**
   * 创建 GitServer 实例
   * @param gitServer
   * @returns {null|Gitee|Github}
   */
  createGitServer(gitServer) {
    if (gitServer === GITHUB) {
      return new Github()
    } else if (gitServer === GITEE) {
      return new Gitee()
    }
    return null
  }

  /**
   * 检查 git server
   * @returns {Promise<void>}
   */
  async checkGitServer() {
    const gitServerPath = this.createGitFile(GIT_SERVER_FILE)
    log.verbose('gitServerPath', gitServerPath)
    let gitServer = readFile(gitServerPath)
    if (!gitServer || this.refreshGitServer) {
      gitServer = (await inquirer.prompt([
        {
          type: 'list',
          name: 'gitServerType',
          default: GITHUB,
          message: '请选择您想要托管的 Git 仓库平台',
          choices: [
            {
              value: GITHUB,
              name: 'Github'
            },
            {
              value: GITEE,
              name: 'Gitee'
            }
          ]
        }
      ])).gitServerType
      if (writeFile(gitServerPath, gitServer)) {
        log.success('git server 写入成功')
      } else {
        throw new Error('git server 写入失败')
      }
    } else {
      log.success('git server 获取成功')
    }
    log.verbose('git server', `${gitServer}->${gitServerPath}`)
    this.gitServer = this.createGitServer(gitServer)
    if (!this.gitServer) {
      throw new Error('gitServer 初始化失败')
    }
  }

  /**
   * 检查 git token
   * @returns {Promise<void>}
   */
  async checkGitToken() {
    const gitTokenPath = this.createGitFile(GIT_TOKEN_FILE)
    log.verbose('gitTokenPath', gitTokenPath)
    let gitToken = readFile(gitTokenPath)
    if (!gitToken || this.refreshGitToken) {
      log.warn(`请先生成 ${this.gitServer.type} token`, `${terminalLink('链接', this.gitServer.getTokenUrl())}`)
      gitToken = (await inquirer.prompt([
        {
          type: 'password',
          name: 'gitToken',
          default: '',
          validate: input => !!input,
          message: '请将 git token 粘贴在此（非明文）'
        }
      ])).gitToken
      if (writeFile(gitTokenPath, gitToken)) {
        log.success('git token 写入成功')
      } else {
        throw new Error('git token 写入失败')
      }
    } else {
      log.success('git token 获取成功')
    }
    log.verbose('git token', gitTokenPath)
    this.gitServer.setToken(gitToken)
    this.token = gitToken
    if (!this.token) {
      throw new Error('git token 获取失败')
    }
  }

  /**
   * 创建文件  主目录/.git/ 下
   * @param file
   * @returns {string}
   */
  createGitFile(file) {
    const rootDir = path.resolve(this.homePath, GIT_ROOT_DIR) // 主目录下的 .git 根目录
    const gitServerFile = path.resolve(rootDir, file)
    fse.ensureFileSync(gitServerFile)
    return gitServerFile
  }

}


module.exports = Git