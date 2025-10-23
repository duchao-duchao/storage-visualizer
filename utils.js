function truncate(str,n){return str.length>n?str.slice(0,n)+'...':str;}
function formatSize(b){return b<1024?b+'B':(b/1024).toFixed(2)+'KB';}

// 计算存储总大小
function calculateTotalSize(storageData) {
  return storageData.reduce((total, item) => total + item.size, 0);
}

// 更新存储大小显示
function updateStorageSizes(data) {
  const localSize = calculateTotalSize(data.local);
  const sessionSize = calculateTotalSize(data.session);
  
  document.getElementById('localSize').textContent = formatSize(localSize);
  document.getElementById('sessionSize').textContent = formatSize(sessionSize);
}

// 验证JSON格式
function validateJSON(value, type) {
  if (type !== 'object' && type !== 'array') {
    return { valid: true, message: '' };
  }
  
  try {
    const parsed = JSON.parse(value);
    if (type === 'array' && !Array.isArray(parsed)) {
      return { valid: false, message: '值必须是有效的数组格式' };
    }
    if (type === 'object' && (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null)) {
      return { valid: false, message: '值必须是有效的对象格式' };
    }
    return { valid: true, message: '格式正确' };
  } catch (e) {
    return { valid: false, message: `JSON格式错误: ${e.message}` };
  }
}

// 更新字符数显示
function updateValueLength() {
  const value = document.getElementById('editValue').value;
  document.getElementById('valueLength').textContent = `字符数: ${value.length}`;
}

// 显示提示消息
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  
  if (type === 'error') {
    toast.style.background = '#e53e3e';
  }
  
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// 显示确认对话框
function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  window.pendingAction = callback;
  document.getElementById('confirmModal').classList.remove('hidden');
}

// 导出数据
function exportData() {
  try {
    const currentData = mode === 'local' ? data.local : data.session;
    const exportData = {
      type: mode,
      timestamp: new Date().toISOString(),
      data: currentData.reduce((acc, item) => {
        acc[item.key] = item.value;
        return acc;
      }, {})
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mode}Storage_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('导出成功');
  } catch (error) {
    console.error('Export failed:', error);
    showToast('导出失败', 'error');
  }
}

// 导入数据
function importData() {
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];
  
  if (!file) {
    showToast('请选择文件', 'error');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const importData = JSON.parse(e.target.result);
      
      if (!importData.data || typeof importData.data !== 'object') {
        throw new Error('无效的数据格式');
      }
      
      // 执行导入
      const results = await chrome.scripting.executeScript({
        target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
        func: (dataToImport, storageMode) => {
          const storage = storageMode === 'local' ? localStorage : sessionStorage;
          let imported = 0;
          
          for (const [key, value] of Object.entries(dataToImport)) {
            try {
              storage.setItem(key, value);
              imported++;
            } catch (error) {
              console.error(`Failed to import ${key}:`, error);
            }
          }
          
          return imported;
        },
        args: [importData.data, mode]
      });
      
      if (results && results[0] && typeof results[0].result === 'number') {
        showToast(`成功导入 ${results[0].result} 项数据`);
        document.getElementById('importModal').classList.add('hidden');
        fileInput.value = '';
        load(); // 重新加载数据
      }
    } catch (error) {
      console.error('Import failed:', error);
      showToast('导入失败：' + error.message, 'error');
    }
  };
  
  reader.readAsText(file);
}

// 执行清空操作
async function executeClearAll() {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
      func: (storageMode) => {
        if (storageMode === 'local') {
          localStorage.clear();
        } else {
          sessionStorage.clear();
        }
        return true;
      },
      args: [mode]
    });
    
    if (results && results[0] && results[0].result) {
      showToast('清空成功');
      load();
    }
  } catch (error) {
    console.error('Clear failed:', error);
    showToast('清空失败', 'error');
  }
}

// 清空全部数据
function clearAllData() {
  const storageType = mode === 'local' ? 'localStorage' : 'sessionStorage';
  showConfirm(
    '清空确认',
    `确定要清空所有 ${storageType} 数据吗？此操作不可恢复！`,
    () => executeClearAll()
  );
}

// 复制值到剪贴板
async function copyValue(key) {
  try {
    const currentData = mode === 'local' ? data.local : data.session;
    const item = currentData.find(item => item.key === key);
    if (item) {
      await navigator.clipboard.writeText(item.value);
      showToast('已复制到剪贴板');
    }
  } catch (error) {
    console.error('Copy failed:', error);
    showToast('复制失败', 'error');
  }
}

// 删除单个存储项
function deleteItem(key) {
  showConfirm(
    '删除确认',
    `确定要删除 "${key}" 吗？`,
    () => executeDelete(key)
  );
}

// 执行删除操作
async function executeDelete(key) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
      func: (storageKey, storageMode) => {
        if (storageMode === 'local') {
          localStorage.removeItem(storageKey);
        } else {
          sessionStorage.removeItem(storageKey);
        }
        return true;
      },
      args: [key, mode]
    });
    
    if (results && results[0] && results[0].result) {
      showToast('删除成功');
      load();
    }
  } catch (error) {
    console.error('Delete failed:', error);
    showToast('删除失败', 'error');
  }
}

// 简易编辑器
async function openEditor(key, type) {
  const items = mode === 'local' ? data.local : data.session;
  const item = items.find(it => it.key === key);
  
  // 设置模态框内容
  document.getElementById('editKey').value = key;
  document.getElementById('editType').textContent = type;
  document.getElementById('editType').className = `type-display type-${type}`;
  document.getElementById('editValue').value = item.originalValue || item.value;
  
  // 更新字符数显示
  updateValueLength();
  
  // 显示模态框
  document.getElementById('editModal').classList.remove('hidden');
  document.getElementById('editValue').focus();
  
  // 如果是对象或数组，启用JSON模式
  if (type === 'object' || type === 'array') {
    document.getElementById('editValue').classList.add('json-mode');
    try {
      // 格式化JSON显示
      const formatted = JSON.stringify(JSON.parse(item.originalValue || item.value), null, 2);
      document.getElementById('editValue').value = formatted;
      updateValueLength();
    } catch (e) {
      // 如果解析失败，保持原值
    }
  } else {
    document.getElementById('editValue').classList.remove('json-mode');
  }
}

// 保存编辑
async function saveEdit() {
  const key = document.getElementById('editKey').value;
  const type = document.getElementById('editType').textContent;
  const value = document.getElementById('editValue').value;
  
  // 验证格式
  const validation = validateJSON(value, type);
  const textarea = document.getElementById('editValue');
  
  // 移除之前的验证消息
  const existingMessage = document.querySelector('.validation-message');
  if (existingMessage) {
    existingMessage.remove();
  }
  
  if (!validation.valid) {
    textarea.classList.add('invalid');
    textarea.classList.remove('valid');
    
    // 显示错误消息
    const message = document.createElement('div');
    message.className = 'validation-message error';
    message.textContent = validation.message;
    textarea.parentNode.appendChild(message);
    return;
  }
  
  textarea.classList.add('valid');
  textarea.classList.remove('invalid');
  
  try {
    // 执行保存
    await chrome.scripting.executeScript({
      target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
      func: (st, k, v) => window[st].setItem(k, v),
      args: [mode === 'local' ? 'localStorage' : 'sessionStorage', key, value]
    });
    
    // 关闭模态框并刷新数据
    closeEditModal();
    showToast('保存成功');
    load();
  } catch (error) {
    showToast('保存失败: ' + error.message);
  }
}

// 关闭编辑模态框
function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
  document.getElementById('editValue').classList.remove('json-mode', 'valid', 'invalid');
  
  // 清除验证消息
  const existingMessage = document.querySelector('.validation-message');
  if (existingMessage) {
    existingMessage.remove();
  }
}

// 数据过滤
function filterData(data, query = '', typeFilter = '', searchType = 'all'){
    const kw = query.toLowerCase();
    let filtered = data;

    // 类型过滤
    if (typeFilter) {
        filtered = filtered.filter(item => item.type === typeFilter);
    }

    // 搜索过滤
    if (kw) {
        filtered = filtered.filter(it => {
        switch (searchType) {
            case 'key':
            return it.key.toLowerCase().includes(kw);
            case 'value':
            return it.value.toLowerCase().includes(kw);
            default:
            return it.key.toLowerCase().includes(kw) || it.value.toLowerCase().includes(kw);
        }
        });
    }

    return filtered;
}

// 应用过滤并渲染
function applyFilters() {
    const currentData = mode === 'local' ? data.local : data.session;
    const query = document.getElementById('search').value;
    const typeFilter = document.getElementById('typeFilter').value;
    const searchType = document.getElementById('searchType').value;
    const filteredData = filterData(currentData, query, typeFilter, searchType);
    render(filteredData, list);
}