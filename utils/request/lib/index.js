'use strict'
const axios = require('axios')

const service = axios.create()


service.defaults.baseURL = process.env.MAGICAL_CLI_API_URL ? process.env.MAGICAL_CLI_API_URL : 'http://120.78.206.254:7001'
// service.defaults.headers.common['Authorization'] = 'AUTH_TOKEN'
// service.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';

service.defaults.timeout = 5000  // 5s得不到响应，请求会自动断开

// 请求拦截器
service.interceptors.request.use(
  config => {
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
service.interceptors.response.use(
  response => {
    const { data } = response
    return data
  },
  error => {
    return Promise.reject(error)
  }
)

module.exports = service