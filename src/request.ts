export type RequestMethod = "GET" | "POST" | "PUT" | "DELETE";

// 定义请求选项接口
export interface RequestOptions {
  signal?: AbortSignal;
}

// 定义 WechatRequestOptions 接口
interface WechatRequestOptions {
  defaultHeaders?: Record<string, string>;
  timeout?: number;
  responseHandler?: (response: any) => Promise<any>;
}

// 定义接口
export interface RequestInterface {
  request<T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T>;
}

// 默认实现（使用 fetch）
export const FetchRequestImpl: RequestInterface = {
  request: async <T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T> => {
    let body: string | FormData | URLSearchParams | undefined;
    const contentType = headers?.['Content-Type'] || headers?.['content-type'] || 'application/json';

    if (data) {
      if (contentType === 'application/x-www-form-urlencoded') {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(data)) {
          params.append(key, String(value));
        }
        body = params;
      } else if (contentType === 'multipart/form-data') {
        const formData = new FormData();
        const appendToFormData = (key: string, value: any) => {
          if (value instanceof Blob || value instanceof File) {
            formData.append(key, value);
          } else if (typeof value === 'object' && value !== null) {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        };

        for (const [key, value] of Object.entries(data)) {
          appendToFormData(key, value);
        }
        body = formData;
        // 移除 Content-Type，让浏览器自动设置
        delete headers?.['Content-Type'];
        delete headers?.['content-type'];
      } else {
        body = JSON.stringify(data);
      }
    }

    return fetch(url, {
      method,
      headers: {
        ...(contentType !== 'multipart/form-data' ? { "Content-Type": contentType } : {}),
        ...headers
      },
      body,
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

class ApiError extends Error {
  constructor(message: string = 'API request failed.', public code: number = -1) {
    super(message)
    this.name = 'ApiError'
  }
}

export class WechatRequestImpl implements RequestInterface {
  private defaultHeaders: Record<string, string>;
  private timeout?: number;
  responseHandler?: (response: any) => Promise<any>;

  constructor(private baseUrl: string, options: WechatRequestOptions = {}) {
    this.defaultHeaders = options.defaultHeaders || {};
    this.timeout = options.timeout;
    this.responseHandler = options.responseHandler;
  }

  setToken(token: string) {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`
  }

  getToken() {
    return this.defaultHeaders['Authorization']?.replace('Bearer ', '') || null;
  }

  async request<T>(url: string, method: RequestMethod, data?: any, headers?: Record<string, string>, options?: RequestOptions): Promise<T> {
    // WeChat API 的请求实现
    const headersWithDefaults = { ...this.defaultHeaders, ...headers }
    const res = await wxRequest<{ statusCode: number, data: T & { message?: string } }>({
      url: this.baseUrl + url,
      method,
      data,
      header: headersWithDefaults,
      timeout: this.timeout ?? 10000
    }, options?.signal)

    if (this.responseHandler) {
      return await this.responseHandler(res)
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data
    } else {
      throw new ApiError(res.data?.message ?? 'Request failed', res.statusCode)
    }
  }
}

function wxRequest<T>(options: any, signal?: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    // @ts-ignore
    const task = wx.request({
      ...options,
      success(res: any) {
        resolve(res)
      },
      fail(err: any) {
        reject(err)
      }
    })

    if (signal) {
      signal.addEventListener('abort', () => {
        task.abort()
        reject(new AbortError('Request aborted'))
      })
    }
  })
}