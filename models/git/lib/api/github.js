const service = require('@magical-cli/request')
const GITHUB_BASE_URL = 'https://api.github.com'
const GITHUB_HERDERS_ACCEPT = 'application/vnd.github.v3+json'

function getGithubUser(access_token) {
  return service({
    headers: {
      Accept: GITHUB_HERDERS_ACCEPT,
      Authorization: `token ${access_token}`
    },
    baseURL: GITHUB_BASE_URL,
    url: `user`
  })
}

function getGithubOrgs(access_token, username) {
  return service({
    headers: {
      Accept: GITHUB_HERDERS_ACCEPT,
      Authorization: `token ${access_token}`
    },
    baseURL: GITHUB_BASE_URL,
    // url: `users/${username}/orgs`,
    url: `/user/orgs`,
    params: {
      page: 1,
      per_page: 100
    }
  })
}

function getGithubRepo(access_token, login, name) {
  return service({
    headers: {
      Accept: GITHUB_HERDERS_ACCEPT,
      Authorization: `token ${access_token}`
    },
    baseURL: GITHUB_BASE_URL,
    url: `repos/${login}/${name}`
  }).catch(err => {
    return null
  })
}

function createGithubRepo(access_token, name) {
  return service({
    headers: {
      Accept: GITHUB_HERDERS_ACCEPT,
      Authorization: `token ${access_token}`
    },
    baseURL: GITHUB_BASE_URL,
    url: `user/repos`,
    method: 'post',
    data: {
      name
    }
  })
}

function createGithubOrgRepo(access_token, org, name) {
  return service({
    headers: {
      Accept: GITHUB_HERDERS_ACCEPT,
      Authorization: `token ${access_token}`
    },
    baseURL: GITHUB_BASE_URL,
    url: `orgs/${org}/repos`,
    method:'post',
    data: {
      name
    }
  })
}
module.exports = {
  getGithubUser,
  getGithubOrgs,
  getGithubRepo,
  createGithubRepo,
  createGithubOrgRepo
}