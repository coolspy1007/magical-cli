# magical-cli

## 前端脚手架工具
- 可定制模板，实现快速复用已成熟项目模板，自动安装依赖并启动项目
- 包含自动化提交、创建分支、升级版本、合并代码，打 tag 等，规范并标准化 git flow
- 一条指令实现云构建、发布上线，并生成可访问链接，发布流程标准化并提高发布上线效率

Options:

-V, --version                   显示当前版本

-d, --debug                     开启调试模式

-tp, --targetPath <targetPath>  指定本地调试文件路径

-h, --help                      显示帮助信息


## Command：magical-cli init [options] [projectName]

### 选择项目模板（可定制），创建项目，自动安装依赖并运行

#### Options:

-f, --force 强制初始化项目

-h, --help 显示命令帮助信息

## Command：magical-cli publish [options]

### 一条指令实现 git flow 自动化，云构建、云发布

#### Options:

-rs, --refreshGitServer 强制更新远程 Git 仓库平台 【github | gitee】

-rt, --refreshGitToken 强制更新远程 Git 仓库 token

-ro, --refreshGitOwner 强制更新远程 Git 仓库类型 【个人仓库 | 组织仓库】

-rp, --refreshGitPublish 强制更新发布平台 【oss | 指定服务器】

-bc, --buildCmd [buildCmd]  自定义构建命令 (default: "npm run build")

-pd, --prod 发布正式版本 【正式版本会在发布完成后自动合并、打tag，并自动删除开发分支】

-ht, --history 使用 history 路由方式 【针对 vue history路由模式，需上传模板文件至指定服务器】

-h, --help 显示命令帮助信息

