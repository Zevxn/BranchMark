/**
 * 加密辅助工具类
 * 使用浏览器原生 Web Crypto API (AES-GCM)
 */
class CryptoHelper {
  constructor() {
    this.algo = 'AES-GCM';
    // 固定盐值，确保加密结果的一致性
    this.salt = new TextEncoder().encode('Nutstore_Internal_Static_Salt'); 
  }

  // 从密码派生密钥 (PBKDF2)
  async deriveKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: this.salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: this.algo, length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // 加密数据 -> Base64字符串
  async encrypt(data, password) {
    const key = await this.deriveKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12字节随机IV
    const encodedData = new TextEncoder().encode(JSON.stringify(data));
    
    const encryptedContent = await crypto.subtle.encrypt(
      { name: this.algo, iv: iv },
      key,
      encodedData
    );

    // 拼接 IV + 密文
    const buffer = new Uint8Array(iv.byteLength + encryptedContent.byteLength);
    buffer.set(iv, 0);
    buffer.set(new Uint8Array(encryptedContent), iv.byteLength);
    
    return this.arrayBufferToBase64(buffer);
  }

  // 解密 Base64字符串 -> 原始数据
  async decrypt(base64Data, password) {
    const key = await this.deriveKey(password);
    const bytes = this.base64ToArrayBuffer(base64Data);

    const iv = bytes.slice(0, 12);
    const data = bytes.slice(12);

    try {
      const decryptedContent = await crypto.subtle.decrypt(
        { name: this.algo, iv: iv },
        key,
        data
      );
      return JSON.parse(new TextDecoder().decode(decryptedContent));
    } catch (e) {
      console.log("解密失败:", e);
      throw new Error('数据解密失败，可能是密钥不匹配或文件损坏');
    }
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  base64ToArrayBuffer(base64) {
    const binary_string = atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
  }
}

class NutstoreSync {
  constructor() {
    this.config = {
      baseURL: 'https://dav.jianguoyun.com/dav',
      appFolder: 'AI对话收藏'
    };
    this.crypto = new CryptoHelper();
    this.INTERNAL_SECRET = "NutstoreSync_HTMLElement"; 

  }

  async getAuthHeader() {
    const result = await chrome.storage.local.get('nutstore_credentials');
    if (!result.nutstore_credentials) throw new Error('未登录');
    return `Basic ${result.nutstore_credentials}`;
  }

  async ensureFolderExists() {
    const authHeader = await this.getAuthHeader();
    const folderPath = this.config.appFolder;
    
    const response = await fetch(`${this.config.baseURL}/${folderPath}/`, {
      method: 'PROPFIND',
      headers: {
        'Authorization': authHeader,
        'Depth': '0'
      }
    });
    
    if (response.status === 404) {
      throw new Error(`文件夹 "${folderPath}" 不存在，请在坚果云网页端创建`);
    }
    
    return response.ok;
  }

  // 上传单个键的数据（强制加密）
  async uploadKey(key, data, version) {
    try {
      const authHeader = await this.getAuthHeader();
      const filePath = `${this.config.appFolder}/${key}.json`;
      
      // 🔒 强制使用内置密钥加密
      const encryptedValue = await this.crypto.encrypt(data, this.INTERNAL_SECRET);
      
      const dataWithMeta = {
        value: encryptedValue,
        encrypted: true, // 标记为已加密
        _syncMeta: {
          lastModified: version,
          key: key
        }
      };
      
      const response = await fetch(`${this.config.baseURL}/${filePath}`, {
        method: 'PUT',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataWithMeta, null, 2)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`上传 ${key} 失败: ${response.status} ${errorText}`);
      }
      console.log(`✅ 成功上传 (已加密): ${key}`);
      return { success: true, key };
    } catch (error) {
      console.log(`上传键 ${key} 错误:`, error);
      throw error;
    }
  }

  // 下载单个键的数据（自动识别是否需要解密）
  async downloadKey(key) {
    try {
      const authHeader = await this.getAuthHeader();
      const filePath = `${this.config.appFolder}/${key}.json`;
      
      const response = await fetch(`${this.config.baseURL}/${filePath}`, {
        method: 'GET',
        headers: {
          'Authorization': authHeader
        }
      });
      
      if (response.status === 404) return null;
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`下载 ${key} 失败: ${response.status} ${errorText}`);
      }
      
      const jsonContent = await response.json();
      
      // 🔓 智能判断：如果标记为加密，则使用内置密钥解密
      if (jsonContent.encrypted === true) {
        try {
            // 解密
            const decryptedValue = await this.crypto.decrypt(jsonContent.value, this.INTERNAL_SECRET);
            return decryptedValue;
        } catch (e) {
            console.log(`文件 ${key} 解密失败`, e);
            throw new Error('云端文件损坏或版本不兼容');
        }
      } 
      
      // 📄 兼容模式：如果没有加密标记，说明是旧文件，直接返回原文
      console.log(`[Sync] 读取到旧版明文文件: ${key}`);
      return jsonContent.value;

    } catch (error) {
      console.log(`下载键 ${key} 错误:`, error);
      throw error;
    }
  }

  // 获取云端所有文件列表
  async listRemoteFiles() {
    try {
      const authHeader = await this.getAuthHeader();
      const folderPath = this.config.appFolder;
      
      const response = await fetch(`${this.config.baseURL}/${folderPath}/`, {
        method: 'PROPFIND',
        headers: {
          'Authorization': authHeader,
          'Depth': '1'
        }
      });
      
      if (!response.ok) {
        throw new Error(`获取文件列表失败: ${response.status}`);
      }
      
      const xmlText = await response.text();
      
      const files = [];
      const responseRegex = /<d:response>([\s\S]*?)<\/d:response>/g;
      const matches = xmlText.matchAll(responseRegex);
      
      for (const match of matches) {
        const block = match[1];
        
        const hrefMatch = block.match(/<d:href>([^<]+)<\/d:href>/);
        if (!hrefMatch) continue;
        
        const href = decodeURIComponent(hrefMatch[1]);
        const filename = href.split('/').pop();
        
        if (!filename || !filename.endsWith('.json') || block.includes('<d:collection/>')) {
          continue;
        }
        
        const lastModMatch = block.match(/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/i);
        const lastModified = lastModMatch ? 
          new Date(lastModMatch[1]).getTime() : Date.now();
        
        const etagMatch = block.match(/<d:getetag>([^<]+)<\/d:getetag>/i);
        const etag = etagMatch ? etagMatch[1].replace(/"/g, '') : '';
        
        files.push({
          key: filename.replace('.json', ''),
          lastModified,
          etag
        });
      }
      
      return files;
    } catch (error) {
      console.log('[listRemoteFiles] 致命错误:', error);
      throw new Error(`无法解析云端文件列表: ${error.message}`);
    }
  }

  async checkKeyVersion(key) {
    try {
      const authHeader = await this.getAuthHeader();
      const filePath = `${this.config.appFolder}/${key}.json`;
      
      const response = await fetch(`${this.config.baseURL}/${filePath}`, {
        method: 'HEAD',
        headers: {
          'Authorization': authHeader
        }
      });
      
      if (!response.ok) return null;
      
      const lastModified = response.headers.get('Last-Modified');
      const etag = response.headers.get('ETag');
      
      return {
        key,
        lastModified: new Date(lastModified).getTime(),
        etag: etag
      };
    } catch (error) {
      console.log(`检查键 ${key} 版本错误:`, error);
      return null;
    }
  }

  async deleteKey(key) {
    try {
      const authHeader = await this.getAuthHeader();
      const filePath = `${this.config.appFolder}/${key}.json`;
      
      const response = await fetch(`${this.config.baseURL}/${filePath}`, {
        method: 'DELETE',
        headers: { 'Authorization': authHeader }
      });
      
      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`删除失败: ${response.status} ${errorText}`);
      }
      
      console.log(`✓ 已删除云端文件: "${key}"`);
      return { success: true, key };
    } catch (error) {
      console.log(`删除键 ${key} 错误:`, error);
      throw error;
    }
  }
}