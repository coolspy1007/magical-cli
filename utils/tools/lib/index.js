'use strict'
/**
 * @description 工具函数
 * @author 起点丶
 */

const colors = require('colors')
const ora = require('ora') // 命令行交互 loading spinner
const cliSpinner = require('cli-spinner') // 命令行交互 loading spinner
// const cliSpinners = require('cli-spinners')  // json 一些 spinner 的样式
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


async function spinnerStart(text) {
  /** ora */
  // const spinnerStyle = cliSpinners.dots9
  return ora(colors.yellow(text)).start()

  /** cli-spinner
  // const Spinner = cliSpinner.Spinner;
  // const spinner = new Spinner(`${text} %s`);
  // spinner.setSpinnerString('|/-\\');
  // spinner.start();
  // return spinner
   */
}

async function sleep(time=1000){
  return new Promise(resolve => setTimeout(resolve, time))
}

module.exports = {
  isObject,
  spawn,
  spinnerStart,
  sleep
}
