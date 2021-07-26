'use strict'
/**
 * @description 工具函数
 * @author 起点丶
 */
const fs = require('fs')
const path = require('path')

const fse = require('fs-extra')
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

/**
 * 异步调用 spawn 做 error 和 exit 的监听
 * @param command
 * @param args
 * @param options
 * @param stdout
 * @param stderr
 * @returns {Promise<unknown>}
 */
function execAsync(command, args, options, stdout, stderr) {
  return new Promise((resolve, reject) => {
    const cp = spawn(command, args, options)
    cp.on('error', err => {
      reject(err)
    })
    cp.on('exit', code => {
      resolve(code)
    })
    if (!stdout) {
      stdout = () => {
      }
    }
    if (!stderr) {
      stderr = () => {
      }
    }
    cp.stdout.on('data', stdout)
    cp.stderr.on('data', stderr)
  })
}


/**
 * 格式化命令 npm install => { cmd:'npm', args:['install'] }
 * @param cmdStr
 * @returns {null|{args: string[], cmd: string}}
 */
function formatCmd(cmdStr) {
  if (!cmdStr || typeof cmdStr !== 'string') {
    return null
  }
  const cmdArr = cmdStr.split(' ')
  const cmd = cmdArr[0]
  const args = cmdArr.slice(1)
  return { cmd, args }
}

/**
 * loading 旋转动画
 * @param text
 * @returns {ora.Ora}
 */
function spinnerStart(text) {
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

/**
 * 读取文件内容
 * @param path 文件路径
 * @param options 选项  toJson json形式读取  默认 string
 * @returns {{type: "Buffer", data: number[]}|string|null}
 */
function readFile(path, options = {}) {
  if (!fs.existsSync(path)) {
    return null
  }
  const buffer = fs.readFileSync(path)
  if (options.toJson) {
    return buffer.toJSON()
  } else {
    return buffer.toString()
  }
}

/**
 * 写入文件
 * @param path
 * @param data
 * @param reWrite 强制写入
 * @returns {boolean}
 */
function writeFile(path, data, { reWrite = true } = {}) {
  if (fs.existsSync(path)) {
    if (reWrite) {
      fs.writeFileSync(path, data)
      return true
    }
  } else {
    fs.writeFileSync(path, data)
    return true
  }
  return false
}

/**
 * 获取 package.json 内容，不存在则返回 null
 * @param dir
 * @returns {null|*}
 */
function getPackageJson(dir){
  const pkg = path.resolve(dir,'package.json')
  if(fs.existsSync(pkg)){
    return fse.readJsonSync(pkg)
  }
  return null
}


/**
 * 程序休眠
 * @param time
 * @returns {Promise<unknown>}
 */
async function sleep(time = 1000) {
  return new Promise(resolve => setTimeout(resolve, time))
}

module.exports = {
  isObject,
  spawn,
  spinnerStart,
  sleep,
  formatCmd,
  execAsync,
  readFile,
  writeFile,
  getPackageJson
}
