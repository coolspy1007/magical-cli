'use strict'
/**
 * @description 工具函数
 * @author 起点丶
 */


/**
 * 判断是否为 object
 * @param target
 * @returns {boolean}
 */
const isObject = (target) => {
  return Object.prototype.toString.call(target) === '[object Object]'
}


/**
 * 兼容 windows 的 spawn 方法
 * @param command  命令
 * @param args  参数
 * @param options
 * @returns {ChildProcessWithoutNullStreams}
 */
function spawn(command, args, options) {
  const isWindows = process.platform === 'win32'
  const cmd = isWindows ? 'cmd' : command
  let cmdArgs = isWindows ? ['/c'].concat(command, args) : args
  // 将参数中 \\ 替换为 /  不然windows会报错
  cmdArgs = cmdArgs.map(value => value.replace(/\\/g, "/"))
  // console.log(cmdArgs)
  return require('child_process').spawn(cmd, cmdArgs, options)
}


module.exports = { isObject, spawn }
