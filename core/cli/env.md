# 环境变量

## 需要在 .magical-cli 文件中配置的

- `CLI_HOME` 缓存主目录文件夹名称（在cli环境变量文件中配置）.magical-cli
- `MAGICAL_CLI_API_URL` API base_url 用户获取项目模板及云构建、云发布

## 系统用到的

- `CLI_HOME_PATH` 缓存用户主目录（如果CLI_HOME未配置默认 .magical-cli 具体路径）
- `LOG_LEVEL` 日志等级（npmlog）默认 = `info`， debug模式下 = `verbose`