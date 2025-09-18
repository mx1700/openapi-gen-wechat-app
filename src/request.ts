type RequestMethod = "GET" | "POST" | "PUT" | "DELETE";

// 定义请求选项接口
export interface RequestOptions {
  signal?: AbortSignal;
}

// 定义 WechatRequestOptions 接口
interface WechatRequestOptions {
  defaultHeaders?: Record<string, string>;
  timeout?: number;
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

class AbortError extends Error {
  constructor(message: string = 'The operation was aborted.') {
    super(message)
    this.name = 'AbortError'
  }
}

class WechatRequestImpl implements RequestInterface {
  private defaultHeaders: Record<string, string>;
  private timeout?: number;

  constructor(private baseUrl: string, options: WechatRequestOptions = {}) {
    this.defaultHeaders = options.defaultHeaders || {};
    this.timeout = options.timeout;
  }

  setToken(token: string) {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`
  }

  async request<T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T> {
    // WeChat API 的请求实现
    const headersWithDefaults = { ...this.defaultHeaders, ...headers }
    return new Promise((resolve, reject) => {
      // @ts-ignore
      const task = wx.request({
        url: this.baseUrl + url,
        method,
        data,
        header: headersWithDefaults,
        timeout: this.timeout ?? 10000,
        success(res: { statusCode: number; data: T }) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(res.data)
          } else {
            reject(new Error(`Request failed with status code ${res.statusCode}`))
          }
        },
        fail(err: any) {
          reject(err)
        }
      })
      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          task.abort()
          reject(new AbortError('Request aborted'))
        })
      }
    })
  }
}

// 可替换的实现变量
export let requestImpl: RequestInterface = defaultRequestImpl;

// 导出的 request 函数，使用当前实现
export async function request<T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T> {
  return requestImpl.request(url, method, data, headers, options);
}