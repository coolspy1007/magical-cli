'use strict'

const path = require('path')
const log = require('@magical-cli/log')
const pkg = require('../package.json')
const colors = require('colors/safe') // log 字体颜色
const semver = require('semver') // 比较版本
const userHome = require('os').homedir() // 获取用户主目录  user-home包已弃用
const pathExists = require('path-exists')
const { getLastUsableVersion } = require('@magical-cli/npm')
// const { init } = require('@magical-cli/init')
const exec = require('@magical-cli/exec')
const { DEFAULT_CLI_HOME, CLI_ENV_FILE_NAME } = require('./constant')
const { program } = require('commander')

async function core(argv) {
  // log.success('success', 'success....')
  try {
    await prepare()
    registerCommander()
  } catch (e) {
    if (program.opts().debug) {
      console.log(e)
    } else {
      log.error('', colors.red(e.message ? e.message : e))
    }
    // log.error('', e)
  }
}

/**
 * 注册 commands
 */
function registerCommander() {
  program
    .name(Object.keys(pkg.bin)[0])
    .usage(`<command> [options]`)
    .version(pkg.version)
    .option('-d, --debug', '开启调试模式', false)
    .option('-tp, --targetPath <targetPath>', '指定本地调试文件路径', '')

  program.on('option:targetPath', () => {
    // 监听 targetPath option ，挂载到全局环境变量
    // 通过挂载到环境变量 env 上，来获取一些全局属性是比较好的方式
    process.env.CLI_TARGET_PATH = program.opts().targetPath
  })

  program
    .command('init [projectName]')
    .option('-f, --force', '强制初始化项目')
    .action(exec)

  program
    .command('publish')
    .option('-rs, --refreshGitServer', '强制更新远程 Git 仓库平台')
    .option('-rt, --refreshGitToken', '强制更新远程 Git 仓库 token')
    .option('-ro, --refreshGitOwner', '强制更新远程 Git 仓库类型')
    .action(exec)

  // debug 模式监听
  program.on('option:debug', () => {
    if (program.opts().debug) {
      log.setLevel('verbose')
    }
  })

  // 未知命令监听
  program.on('command:*', (obj) => {
    const availableCommands = program.commands.map(cmd => cmd.name())
    log.error('未知命令', obj[0])
    if (availableCommands.length > 0) {
      console.log(colors.blue('可用命令：' + availableCommands.join(',')))
    }
  })
  program.parse(process.argv)
}

/**
 * 准备阶段
 * @returns {Promise<void>}
 */
async function prepare() {
  showPkgVersion()
  checkRoot()
  checkUserHome()
  // checkInputArgs()  // 参数检查通过 commander 处理
  checkEnv()
  await checkPkgVersion()
  log.verbose('debug', "test debug log")
}

/**
 * 显示当前版本
 */
function showPkgVersion() {
  log.notice('当前版本', pkg.version)
}


/**
 * 检查 root 账户，降级处理
 */
function checkRoot() {
  // root-check 2.0 版本改为了 ES Module ，nodejs不支持，直接使用1.0.0
  const rootCheck = require('root-check')
  rootCheck()
}

/**
 * 检查用户主目录
 */
function checkUserHome() {
  // 如果用户主目录不存在，跑出异常
  if (!userHome || !pathExists.sync(userHome)) {
    throw new Error(colors.red('当前登录用户主目录不存在'))
  }
}


/**
 * 脚手架注册之前，检查入参，用于全局 debug 调试
 */

/* 移除！ 交给 commander 处理
function checkInputArgs() {
  const minimist = require('minimist')
  const args = minimist(process.argv.slice(2))
  checkArgs(args)
}

function checkArgs(args) {
  if (args.debug) {
    // process.env.LOG_LEVEL = 'verbose'
    log.setLevel('verbose')
  } else {
    // process.env.LOG_LEVEL = 'info'
    log.setLevel('info')
  }
}
*/
/**
 * 检查环境变量
 * 可以将一些必要信息存入环境变量，比如用户名密码及一些默认配置信息
 */
function checkEnv() {
  // dotenv 可以读取环境变量配置，并挂载到 process.env
  const dotEnv = require('dotenv')
  const dotEnvPath = path.resolve(userHome, CLI_ENV_FILE_NAME)
  // 如果存在 .magical-cli-env 则从 .magical-cli-env 获取环境变量配置并挂载到 process.env
  if (pathExists.sync(dotEnvPath)) {
    dotEnv.config({
      path: dotEnvPath
    })
  }
  createDefaultEnv()
  log.verbose('CLI_HOME_PATH', process.env.CLI_HOME_PATH)
}
/**
 * 根据环境变量，创建默认配置，挂载到 process.env
 */
function createDefaultEnv() {
  if (process.env.CLI_HOME) {
    // console.log(path.join(userHome, process.env.CLI_HOME))
    process.env.CLI_HOME_PATH = path.join(userHome, process.env.CLI_HOME)
  } else {
    process.env.CLI_HOME_PATH = path.join(userHome, DEFAULT_CLI_HOME)
  }
}

/**
 * 检查项目版本,如果有最新版本，提示更新
 */
async function checkPkgVersion() {
  // 1、获取当前版本号和模块名
  const currentVersion = pkg.version
  const npmName = pkg.name
  // const npmName = '@imooc-cli/core'
  // 2、调用 npm API，获取所有版本号
  // 3、提取所有版本号，比对哪些版本号是大于当前版本号的
  // 4、获取最新的版本号，提示用户更新到最新版本
  const lastVersion = await getLastUsableVersion(npmName, currentVersion)
  if (lastVersion) {
    log.warn('更新版本', colors.yellow(`有最新的版本 v${lastVersion} ,可以通过 npm i ${npmName} -g 更新`))
  }
}


module.exports = core

// 集中捕获程序中可能存在的未被捕获的异常
// 未处理的promise rejection
process.on('unhandledRejection', (reason, p) => {
  console.log('unhandledRejection', reason, p);
  throw reason;
});

// 未被处理的错误
process.on('uncaughtException', (error) => {
  console.log('uncaughtException', error);
  process.exit(1);
});