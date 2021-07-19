const service = require('@magical-cli/request')
const GITEE_BASE_URL = 'https://gitee.com/api/v5'

function getGiteeUser(access_token) {
  return service({
    baseURL: GITEE_BASE_URL,
    url: 'user',
    params: {
      access_token
    }
  })
}

function getGiteeOrgs(access_token, username) {
  return service({
    baseURL: GITEE_BASE_URL,
    url: `users/${username}/orgs`,
    params: {
      access_token,
      page: 1,
      per_page: 100
    }
  })
}

function getGiteeRepo(access_token, login, name) {
  return service({
    baseURL: GITEE_BASE_URL,
    url: `repos/${login}/${name}`,
    params: {
      access_token
    }
  }).catch(err => {
    return null
  })
}

function createGiteeRepo(access_token, name) {
  return service({
    baseURL: GITEE_BASE_URL,
    url: `user/repos`,
    method:'post',
    params: {
      access_token,
      name
    }
  })
}

function createGiteeOrgRepo(access_token, org, name) {
  return service({
    baseURL: GITEE_BASE_URL,
    url: `orgs/${org}/repos`,
    method:'post',
    params: {
      access_token,
      name
    }
  })
}

module.exports = {
  getGiteeUser,
  getGiteeOrgs,
  getGiteeRepo,
  createGiteeRepo,
  createGiteeOrgRepo
}