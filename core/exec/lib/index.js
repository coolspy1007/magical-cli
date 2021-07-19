'use strict'
/**
 * @description 动态执行命令
 */

const path = require('path')
const Package = require('@magical-cli/package')
const log = require('@magical-cli/log')
const { spawn } = require('@magical-cli/tools')

// 临时配置表
const SETTING = {
  init: '@magical-cli/init',
  publish: '@magical-cli/publish'
}
// 默认缓存路径包的目录名，即包存放的目录
const CACHE_DIR = 'dependencies'


/**
 * 动态执行命令
 */
async function exec() {
  const targetPath = process.env.CLI_TARGET_PATH  // package 包的路径 --targetPath 传入
  const userHomePath = process.env.CLI_HOME_PATH  // 用户主目录
  // 缓存路径 最终存放的路径:主目录下的 dependencies/node_modules
  const storePath = path.resolve(userHomePath, CACHE_DIR)
  // 拿到 command 的参数，最后一个参数是 当前 command 对象
  const argArr = formatArgv(arguments)
  const cmdObj = argArr[argArr.length - 1]
  const cmdName = cmdObj.name
  const packageName = SETTING[cmdName] // 拿到包名（需要动态执行的命令包名）
  const packageVersion = 'latest' // 包的版本（默认最新版）


  // 创建 package 的实例
  const pkg = new Package({
    targetPath: targetPath ? targetPath : storePath,
    packageName,
    packageVersion
  })

  // 如果未传入 targetPath 说明不执行本地代码，则读取用户主目录的缓存目录下载更新命令
  if (!targetPath) {
    log.verbose('package name', pkg.packageName)
    log.verbose('package version', pkg.packageVersion)
    if (await pkg.exists()) {
      // 更新包
      await pkg.update()
    } else {
      // 安装包
      // console.log('installing....')
      await pkg.install()
    }
    log.verbose('new version', pkg.packageVersion)
  }

  log.verbose('userHomePath', userHomePath)
  log.verbose('targetPath', targetPath)
  log.verbose('storePath', storePath)


  // 拿到 package 的入口文件路径
  const rootFilePath = pkg.getRootFilePath()
  log.verbose('rootFilePath', rootFilePath)

  // 如果 入口文件真实有效，那么就导入并执行
  if (rootFilePath) {
    // 在当前 node 主进程调用
    // require(rootFilePath)(argArr)
    // 在 node 子进程中调用
    // console.log('主进程：',process.pid)
    const code = `require("${rootFilePath}").call(null,${JSON.stringify(argArr)})`
    const childProcess = spawn('node', ['-e', code], {
      cwd: process.cwd(),
      stdio: 'inherit' // 将子进程标准输入输出流返回给主进程
    })
    // 当产生子进程时执行
    childProcess.on('spawn',()=>{
      // console.log('子进程spawn...',process.pid)
    })
    // 监听 error
    childProcess.on('error', e => {
      log.error(e.message)
      process.exit(1)
    })
    // 监听 exit
    childProcess.on('exit', e => {
      log.verbose('命令执行完毕', e)
      process.exit(e)
    })
  }
}

/**
 * 格式化 commander action 的命令参数
 * @param argv commander action 原始参数
 * @returns {unknown[]}
 */
function formatArgv(argv) {
  const argsArr = Array.from(argv)
  const cmd = argsArr[argsArr.length - 1]
  const obj = Object.create(null)
  Object.keys(cmd).forEach(key => {
    if (cmd.hasOwnProperty(key) && !key.startsWith('_') && key!=='parent' ) {
      obj[key] = cmd[key]
    }
  })
  obj.opts = cmd.opts()
  obj.args = cmd.args
  obj.name = cmd.name()
  argsArr[argsArr.length - 1] = obj
  return argsArr
}

module.exports = exec


