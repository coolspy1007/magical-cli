'use strict'
const fs = require('fs')
const path = require('path')

const inquirer = require('inquirer')
const fse = require('fs-extra')
const colors = require('colors')
const semver = require('semver')

const Command = require('@magical-cli/command')
const log = require('@magical-cli/log')
const Package = require('@magical-cli/package')
const { spinnerStart, sleep } = require('@magical-cli/tools')

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

function init(argArr) {
  return new InitCommand(argArr)

}

class InitCommand extends Command {
  init() {
    this.projectName = this._args[0]
    this.force = !!this._opts.force
    // console.log('子进程：', process.pid)
    log.verbose('projectName', this.projectName)
    log.verbose('force', this.force)
  }

  async exec() {
    // console.log('子进程：',process.pid)
    // console.log(`exec ${this.projectName}... -> ${this.force?'force':''}`)
    try {
      await this.prepare()
      await this.downloadTemplate()
    } catch (err) {
      if (process.env.LOG_LEVEL === 'verbose') {
        console.log(err)
      } else {
        log.error('', colors.red(err.message ? err.message : err))
      }

      // log.error('', colors.red( err))
    }
  }



  /**
   * 下载模板
   * @returns {Promise<void>}
   */
  async downloadTemplate(npmName) {
    // console.log(this.projectTemplate, this.inputProjectInfo)
    // 拿到要下载的模板信息
    const { name, version: packageVersion, npmName: packageName } = this.checkedProjectTmplate
    // 实例化 Package 对象
    const templatePkg = new Package({
      targetPath: path.resolve(process.env.CLI_HOME_PATH, 'template'),
      packageName,
      packageVersion
    })
    console.log(templatePkg.targetPath, templatePkg.packageName, templatePkg.packageVersion)

    // 如果模板存在那么执行下载，不存在则更新

    if (await templatePkg.exists()) {
      const spinner = await spinnerStart('正在更新项目模板')
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

  }

  /**
   * init 执行前的准备工作
   * @returns {Promise<void>}
   */
  async prepare() {
    log.verbose('MAGICAL_CLI_API_URL', process.env.MAGICAL_CLI_API_URL)
    // 请求接口获取模板信息
    this.projectTemplate = await this.getTemplates(TYPE_PROJECT)
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
          fse.emptyDirSync(cwd)
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
    return await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        default: '',
        message: '请输出项目名称',
        validate: function (input) {
          const done = this.async()
          setTimeout(function () {
            if (!/^[a-zA-Z]+([-_][a-zA-Z][a-zA-Z0-9]?|\d)*$/.test(input)) {
              done('请输入合法的项目名称')
              return
            }
            done(null, true)
          }, 0)
        },
        filter: v => {
          return v
        }
      },
      {
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
      }
    ])
  }

  /**
   * 获取组件交互数据
   * @returns {Promise<{}>}
   */
  async getInputComponentInfo() {
    let componentData = {}
    return componentData
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

}

module.exports = init

