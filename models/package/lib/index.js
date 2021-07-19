'use strict'

const path = require('path')
const pkgDir = require('pkg-dir')
const pathExists = require('path-exists')
const semver = require('semver')
const fse = require('fs-extra')

const { isObject } = require('@magical-cli/tools')
const { packageInstall, getLatestVersion } = require('@magical-cli/npm')

class Package {
  constructor(options) {
    if (!options) {
      throw new Error('Package 构造函数必须传入 options')
    }
    if (!isObject(options)) {
      throw new Error('Package 构造函数传入的 options 必须是 object')
    }
    // package 的目标路径
    this.targetPath = options.targetPath
    // package 名称
    this.packageName = options.packageName
    // package 版本
    this.packageVersion = options.packageVersion

  }

  // 获取 package 的存放路径
  get packagePath() {
    return path.resolve(this.targetPath, 'node_modules', this.packageName)
  }

  // 获取 package group名称 @magical-cli
  get packageGroupName() {
    return this.packageName.split('/')[0]
  }

  // 获取 package 缓存目录前缀  @magical-cli_init
  get cacheFilePathPrefix() {
    return this.packageName.replace('/', '_')
  }

  // 是否存在文件目录(必须含有package.json)
  get existsFilePath() {
    return pathExists.sync(path.resolve(this.packagePath, 'package.json'))
  }

  /**
   * 格式化 version 去除前边的字符
   */
  formatVersion() {
    const version = semver.clean(this.packageVersion.replace(/^[\^~=vV]*/g, ''))
    this.packageVersion = version ? version : this.packageVersion
  }

  /**
   * 获取真实存在的缓存目录，不存在则返回 null
   * @param version 根据版本获取，默认当前 package 版本
   * @returns {string|null}
   */
  getRealCacheFilePath(version = this.packageVersion) {
    const cachePathName = `_${this.cacheFilePathPrefix}@${version}@${this.packageName}`
    const cachePath = path.resolve(this.targetPath, 'node_modules', cachePathName)
    return pathExists.sync(cachePath) ? cachePath : null
  }


  // 准备工作，包括创建目录
  async prepare() {
    if (this.targetPath && !pathExists.sync(this.targetPath)) {
      fse.mkdirpSync(this.targetPath)
    }
    if (this.packageVersion === 'latest') {
      this.packageVersion = await getLatestVersion(this.packageName)
    }
    // this.packageVersion = semver.clean(this.packageVersion.replace(/^[\^~=vV]*/g,''))
  }

  // 判断 package 是否存在(已经安装)
  async exists() {
    await this.prepare()
    // 先判断是否存在缓存目录，如果不存在缓存目录，则判断安装目录
    return this.getRealCacheFilePath();
  }

  // 安装 package
  async install(version = this.packageVersion) {
    await this.prepare()
    // console.log(`install package ${this.packageName}@${version}...`)
    return packageInstall({
      root: this.targetPath,
      pkgs: [{
        name: this.packageName,
        version
      }]
    })
  }

  // 更新 package
  async update() {
    await this.prepare()
    // 获取最新版本号
    const latestVersion = await getLatestVersion(this.packageName)
    // console.log(`update package ${this.packageName}@${latestVersion}...`)
    // 判断缓存目录是否包含最新版本
    // 如果缓存目录都不存在，则判断当前安装目录版本
    if (!this.getRealCacheFilePath(latestVersion)) {
      await this.install(latestVersion)
      // 替换当前 package 版本为最新(安装失败后不能更新版本)
      this.packageVersion = latestVersion
    }else{
      // 替换当前 package 版本为最新
      this.packageVersion = latestVersion
    }
  }

  /**
   * 获取 package 入口文件路径
   * @returns {string|null}
   */
  getRootFilePath() {
    // 先取缓存目录，没有则取安装目录
    const targetPath = this.getRealCacheFilePath() ? this.getRealCacheFilePath() : this.packagePath
    // 获取 package.json 的所在目录
    const dir = pkgDir.sync(targetPath)
    if (dir) {
      // 读取 package.json
      const pkg = require(path.resolve(dir, 'package.json'))
      // 寻找 main/lib
      if (pkg && pkg.main) {
        return path.resolve(dir, pkg.main)
      }
      // 路径兼容（macOS/windows）
    }
    return null
  }

}

module.exports = Package

