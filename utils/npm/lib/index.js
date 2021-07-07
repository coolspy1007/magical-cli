'use strict'
const axios = require('axios')
const semver = require('semver')
const urlJoin = require('url-join')
const colors = require('colors')

/**
 * 获取 npm 包的信息
 * @param npmName  npm包名
 * @param registry  npm API url
 * @returns {null|Promise<AxiosResponse<any>>}
 */
function getNpmInfo(npmName, registry) {
  if (!npmName) {
    return null
  }
  const registryUrl = registry || _getDefaultRegistry()
  const npmUrl = urlJoin(registryUrl, npmName)
  return axios.get(npmUrl).then(res => {
    if (res.status === 200) {
      return res.data
    }
  }).catch(err => {
    return Promise.reject(colors.red(`${err.message}`))
  })
}

/**
 * 获取 npm 包的 versions
 * @param npmName  npm 包名
 * @param registry  npm API url
 * @returns {Promise<string[]|*[]>}
 */
async function getNpmVersions(npmName, registry) {
  const npmInfo = await getNpmInfo(npmName)
  return npmInfo ? Object.keys(npmInfo.versions) : []
}


// const versions = await getNpmVersions(npmName, registry)
/**
 * 获取比当前版本高的所有新版本
 * @param baseVersion 当前基础版本
 * @param versions  所有版本
 * @returns string[]
 */
function getLatestVersions(baseVersion, versions) {
  // versions = ['3.0.2','4.8.2','1.0.2','2.5.8','5.5.0','3.2.1']
  return versions.filter((version) => {
    // semver.satisfies 判断版本是否满足某个范围，满足返回true
    return semver.satisfies(version, `>${baseVersion}`)
  }).sort((a, b) => {
    // 返回值 < 0 , 则 a 排在 b 前边
    return semver.gt(a, b) ? -1 : 1
  })
}

/**
 * 获取最新的可更新版本
 * @param npmName  包名
 * @param currentVersion  当前版本
 * @param registry  npm API
 * @returns {Promise<string|null>}
 */
async function getLastVersion(npmName, currentVersion, registry) {
  const versions = await getNpmVersions(npmName, registry)
  // console.log(versions)
  const latestVersions = getLatestVersions(currentVersion, versions)
  // console.log(latestVersions)
  if (latestVersions && latestVersions.length > 0) {
    return latestVersions[0]
  } else {
    return null
  }
}

// 获取默认 API 地址,  isOriginal=true原始的 npm 镜像  false 则是 taobao 镜像（默认）
function _getDefaultRegistry(isOriginal = false) {
  return isOriginal ? 'https://registry.npmjs.org' : 'https://registry.npm.taobao.org'
}


module.exports = { getLastVersion, getLatestVersions, getNpmInfo, getNpmVersions }