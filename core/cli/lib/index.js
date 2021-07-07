'use strict'

const path = require('path')
const log = require('@magical-cli/log')
const pkg = require('../package.json')
const colors = require('colors/safe') // log 字体颜色
const semver = require('semver') // 比较版本
const userHome = require('os').homedir() // 获取用户主目录  user-home包已弃用
const pathExists = require('path-exists')
const { getLastVersion } = require('@magical-cli/npm')
const { LOWEST_NODE_VERSION, CLI_NAME, DEFAULT_CLI_HOME } = require('./constant')

let config = {}

async function core(argv) {
  // log.success('success', 'success....')
  try {
    showPkgVersion()
    checkNodeVersion()
    checkRoot()
    checkUserHome()
    checkInputArgs()
    checkEnv()
    await checkPkgVersion()
    // log.verbose('debug', "test debug log")
  } catch (e) {
    log.error('', e.message ? e.message : e)
  }
}

/**
 * 显示当前版本
 */
function showPkgVersion() {
  log.notice('当前版本', pkg.version)
}


/**
 * 检查node版本
 */
function checkNodeVersion() {
  const currentVersion = process.version
  const lowestVersion = LOWEST_NODE_VERSION
  if (semver.lt(currentVersion, lowestVersion)) {
    throw new Error(colors.red(`${CLI_NAME} 需要安装 v${lowestVersion} 以上版本的 Node.js`))
  }

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

/**
 * 检查环境变量
 * 可以将一些必要信息存入环境变量，比如用户名密码及一些默认配置信息
 */
function checkEnv() {
  // dotenv 可以读取环境变量配置，并挂载到 process.env
  const dotEnv = require('dotenv')
  const dotEnvPath = path.resolve(userHome, '.magical-cli-env')
  // 如果存在 .magical-cli-env 则从 .magical-cli-env 获取环境变量配置并挂载到 process.env
  if (pathExists.sync(dotEnvPath)) {
    dotEnv.config({
      path: dotEnvPath
    })
  }
  // 根据环境变量，创建默认配置，挂载到 process.env
  createDefaultEnv()
  log.verbose('环境变量', process.env.CLI_HOME_PATH)
}

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
  const lastVersion = await getLastVersion(npmName,currentVersion)
  if(lastVersion){
    log.warn('更新版本',colors.yellow(`有最新的版本 v${lastVersion} ,可以通过 npm i ${npmName} -g 更新`))
  }
}

module.exports = core