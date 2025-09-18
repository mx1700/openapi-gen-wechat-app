# OpenAPI WeChat Mini Program Client Generator

根据 OpenAPI 定义自动生成微信小程序客户端代码的 CLI 工具。

## 功能特性

- 🚀 自动生成 TypeScript 客户端代码
- 📱 专为微信小程序优化
- 🏷️ 按 API tag 自动分组文件
- 🔒 类型安全，支持完整的 TypeScript 类型定义
- 📦 零配置，开箱即用
- 🎯 自动生成 ApiClient 包装类，统一管理所有 API 客户端
- 🛑 支持请求取消，通过 AbortController 控制接口请求

## 安装

### 全局安装

```bash
npm install -g openapi-gen-wechat-app
```

### 本地安装

```bash
npm install openapi-gen-wechat-app --save-dev
```

### 从源码构建

```bash
git clone <repository-url>
cd openapi-gen-wechat-app
npm install
npm run build
```

## 使用方法

### 基本用法

```bash
# 使用本地 OpenAPI 文件
openapi-gen-wechat-app ./swagger.json ./output

# 使用远程 OpenAPI URL
openapi-gen-wechat-app https://api.example.com/swagger.json ./output

# 显示帮助信息
openapi-gen-wechat-app --help
```

### 参数说明

- `input`: OpenAPI 定义文件路径（本地文件或 URL）
- `output`: 生成代码的输出目录

## OpenAPI 定义要求

### 接口约束
- 遵循 RPC 风格
- 仅支持 POST 请求方法
- 参数通过请求 Body 传输 JSON 对象
- 响应为 JSON 对象格式
- URL 不包含路径参数和查询参数

### 示例 OpenAPI 定义

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Example API",
    "version": "1.0.0"
  },
  "paths": {
    "/login": {
      "post": {
        "tags": ["auth"],
        "operationId": "login",
        "requestBody": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "username": { "type": "string" },
                  "password": { "type": "string" }
                },
                "required": ["username", "password"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "token": { "type": "string" },
                    "userId": { "type": "number" }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## 生成代码说明

### 文件结构
```
output/
├── index.ts     # API 客户端包装类
├── auth.ts      # 认证相关接口
├── user.ts      # 用户相关接口
├── request.ts   # 请求封装
├── types.ts     # 全局类型定义
└── ...
```

### 生成的代码示例

```typescript
// auth.ts
import { RequestInterface, RequestOptions } from './request';

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token?: string;
  userId?: number;
}

export class AuthClient {
  constructor(private request: RequestInterface) {}

  async login(data: LoginRequest, options?: RequestOptions): Promise<LoginResponse> {
    return this.request.request('/login', 'POST', data, undefined, options);
  }
}
```

```typescript
// index.ts
import { AuthClient } from "./auth";
import { RequestInterface } from "./request";
import { UsersClient } from "./Users";

class ApiClient {
    auth: AuthClient;
    users: UsersClient;
    constructor(private request: RequestInterface) {
        this.request = request;
        this.auth = new AuthClient(this.request);
        this.users = new UsersClient(this.request);
    }
}

export default ApiClient;
```

### 代码特性
- **类型安全**: 自动生成请求和响应 TypeScript 接口
- **方法命名**: 基于 `operationId` 或 `summary` 生成驼峰命名方法
- **文件分组**: 按 OpenAPI `tags` 字段分组生成文件
- **统一调用**: 所有方法内部调用 `src/request.ts` 的 `request` 函数
- **客户端包装**: 自动生成 `ApiClient` 包装类，统一管理所有 API 客户端实例
- **请求取消**: 支持通过 AbortController 取消正在进行的请求

## 请求取消使用方法

所有生成的 API 方法都支持可选的 `options` 参数，可以通过 `options.signal` 传递 `AbortSignal` 来控制请求取消：

```typescript
// 创建 AbortController
const controller = new AbortController();

// 调用 API 方法时传递 signal
await apiClient.auth.login(loginData, { signal: controller.signal });

// 在需要时取消请求
controller.abort();
```

### 使用场景
- **用户界面交互**: 当用户快速切换页面或重复点击时，可以取消之前的请求
- **超时控制**: 设置请求超时时间，超过时间自动取消
- **竞态条件避免**: 确保只处理最新的请求结果

## 依赖要求

生成的项目需要包含以下文件：

### src/request.ts

```typescript
type RequestMethod = "GET" | "POST" | "PUT" | "DELETE";

// 定义请求选项接口
export interface RequestOptions {
  signal?: AbortSignal;
}

// 定义接口
export interface RequestInterface {
  request<T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T>;
}

// 默认实现（使用 fetch）
const defaultRequestImpl: RequestInterface = {
  request: async <T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T> => {
    return fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(data),
      signal: options?.signal
    }).then(response => response.json());
  }
};

// 可替换的实现变量
export let requestImpl: RequestInterface = defaultRequestImpl;

// 导出的 request 函数，使用当前实现
export async function request<T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T> {
  return requestImpl.request(url, method, data, headers, options);
}
```

## 开发

### 项目结构

```
├── src/
│   ├── index.ts      # CLI 入口
│   ├── generator.ts  # 代码生成器
│   └── request.ts    # 请求封装
├── dist/             # 编译输出
├── package.json
├── tsconfig.json
└── README.md
```

### 构建

```bash
npm run build
```

### 测试

```bash
npm test
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

ISC License

## 作者

[Your Name]