// 在当前活动标签页注入脚本，读取 storage 并返回
async function getStorageData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      function detectType(v) {
        try {
          const p = JSON.parse(v);
          if (Array.isArray(p)) return 'array';
          if (p === null) return 'null';
          if (typeof p === 'object') return 'object';
          return typeof p;
        } catch {
          return 'string';
        }
      }
      
      return {
        local:  Object.entries({...localStorage}).map(([k,v])=>({key:k,value:v,originalValue:v,size:new Blob([v]).size,type:detectType(v)})),
        session:Object.entries({...sessionStorage}).map(([k,v])=>({key:k,value:v,originalValue:v,size:new Blob([v]).size,type:detectType(v)}))
      };
    }
  });

  if (!results || results.length === 0) {
    console.error('脚本注入失败：没有返回结果');
    return { local: [], session: [] };
  }
  
  if (results[0].result === null || results[0].result === undefined) {
    console.error('脚本执行失败：返回结果为空');
    return { local: [], session: [] };
  }

  return results[0].result;
}

// 渲染列表
function render(list, container){
  container.innerHTML='';
  if(!list.length){
    container.innerHTML=`
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-text">暂无数据</div>
        <div class="empty-subtext">当前页面没有存储任何数据</div>
      </div>`;
    return;
  }
  
  list.forEach(it=>{
    const div=document.createElement('div');
    div.className='list-item';
    div.innerHTML=`
      <div class="item-content">
        <div class="item-key">${it.key}</div>
        <div class="item-value">${truncate(it.value,50)}</div>
        <div class="item-meta">
          <span class="type-badge type-${it.type}">${it.type}</span>
          <span>${formatSize(it.size)}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="action-button copy" data-action="copy" data-key="${it.key}" title="复制值">
          📋
        </button>
        <button class="action-button edit" data-action="edit" data-key="${it.key}" data-type="${it.type}" title="编辑">
          ✏️
        </button>
        <button class="action-button delete" data-action="delete" data-key="${it.key}" title="删除">
          🗑️
        </button>
      </div>`;
    container.appendChild(div);
  });
}

function truncate(str,n){return str.length>n?str.slice(0,n)+'...':str;}
function formatSize(b){return b<1024?b+'B':(b/1024).toFixed(2)+'KB';}

// 主界面
document.addEventListener('DOMContentLoaded', async ()=>{
  const app=document.getElementById('app');
  app.innerHTML=`
    <div class="header">
      <h1 class="title">
        <span class="title-icon">🗄️</span>
        Storage Visualizer
      </h1>
      <div class="tabs">
        <button id="tabLocal" class="tab-button active">localStorage</button>
        <button id="tabSession" class="tab-button">sessionStorage</button>
      </div>
      <input id="search" class="search-input" placeholder="搜索键名或值..."/>
      <div class="search-filters">
        <select id="typeFilter" class="filter-select">
          <option value="">所有类型</option>
          <option value="string">字符串</option>
          <option value="object">对象</option>
          <option value="array">数组</option>
          <option value="number">数字</option>
        </select>
        <select id="searchType" class="filter-select">
          <option value="all">键名+值</option>
          <option value="key">仅键名</option>
          <option value="value">仅值</option>
        </select>
      </div>
    </div>
    <div class="toolbar">
      <button id="exportBtn" class="toolbar-button primary">
        📤 导出数据
      </button>
      <button id="importBtn" class="toolbar-button">
        📥 导入数据
      </button>
      <button id="clearAllBtn" class="toolbar-button danger">
        🗑️ 清空全部
      </button>
    </div>
    <div class="content">
      <div id="list"></div>
    </div>
    
    <!-- 导入模态框 -->
    <div id="importModal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header">导入数据</div>
        <div class="modal-body">
          <input type="file" id="fileInput" accept=".json" class="file-input" />
          <div style="margin-top: 12px; font-size: 11px; color: #718096;">
            选择JSON格式的备份文件进行导入
          </div>
        </div>
        <div class="modal-footer">
          <button id="cancelImport" class="modal-button secondary">取消</button>
          <button id="confirmImport" class="modal-button primary">导入</button>
        </div>
      </div>
    </div>
    
    <!-- 确认模态框 -->
    <div id="confirmModal" class="modal hidden">
      <div class="modal-content">
        <div class="modal-header" id="confirmTitle">确认操作</div>
        <div class="modal-body" id="confirmMessage">
          确定要执行此操作吗？
        </div>
        <div class="modal-footer">
          <button id="cancelConfirm" class="modal-button secondary">取消</button>
          <button id="confirmAction" class="modal-button primary">确认</button>
        </div>
      </div>
    </div>`;

  const search = document.getElementById('search');
  const list   = document.getElementById('list');
  const btnLocal = document.getElementById('tabLocal');
  const btnSession=document.getElementById('tabSession');

  let data={local:[],session:[]};
  let mode='local';

  async function load(){
    try {
      data=await getStorageData();
      console.log(data, 'data');
      
      applyFilters();
    } catch (error) {
      console.error('加载数据失败:', error);
      list.innerHTML = `
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <div class="error-text">无法访问当前页面的存储数据</div>
          <div style="font-size: 12px; margin-top: 8px; opacity: 0.8;">
            请确保在普通网页上使用此扩展
          </div>
        </div>`;
    }
  }
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

  function applyFilters() {
    const currentData = mode === 'local' ? data.local : data.session;
    const query = document.getElementById('search').value;
    const typeFilter = document.getElementById('typeFilter').value;
    const searchType = document.getElementById('searchType').value;
    const filteredData = filterData(currentData, query, typeFilter, searchType);
    render(filteredData, list);
  }

  function filter(){
    applyFilters();
  }

  btnLocal.addEventListener('click',()=>{
    mode='local';
    btnLocal.classList.add('active');
    btnSession.classList.remove('active');
    applyFilters();
  });
  
  btnSession.addEventListener('click',()=>{
    mode='session';
    btnSession.classList.add('active');
    btnLocal.classList.remove('active');
    applyFilters();
  });
  search.addEventListener('input',applyFilters);
  document.getElementById('typeFilter').addEventListener('change', applyFilters);
  document.getElementById('searchType').addEventListener('change', applyFilters);

  // 列表点击事件 - 区分操作按钮和项目点击
  list.addEventListener('click',e=>{
    const actionButton = e.target.closest('.action-button');
    if (actionButton) {
      e.stopPropagation();
      const action = actionButton.dataset.action;
      const key = actionButton.dataset.key;
      
      switch (action) {
        case 'copy':
          copyValue(key);
          break;
        case 'edit':
          openEditor(key);
          break;
        case 'delete':
          deleteItem(key);
          break;
      }
      return;
    }
    
    if(e.target.tagName==='BUTTON'){
      const key=e.target.dataset.key;
      const type=e.target.dataset.type;
      openEditor(key,type);
    }
  });

  // 工具栏事件
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', () => {
    document.getElementById('importModal').classList.remove('hidden');
  });
  document.getElementById('clearAllBtn').addEventListener('click', clearAllData);

  // 导入模态框事件
  document.getElementById('cancelImport').addEventListener('click', () => {
    document.getElementById('importModal').classList.add('hidden');
  });
  document.getElementById('confirmImport').addEventListener('click', importData);

  // 确认模态框事件
  document.getElementById('cancelConfirm').addEventListener('click', () => {
    document.getElementById('confirmModal').classList.add('hidden');
  });
  document.getElementById('confirmAction').addEventListener('click', () => {
    if (window.pendingAction) {
      window.pendingAction();
      window.pendingAction = null;
    }
    document.getElementById('confirmModal').classList.add('hidden');
  });

  load();

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

// 清空全部数据
function clearAllData() {
  const storageType = mode === 'local' ? 'localStorage' : 'sessionStorage';
  showConfirm(
    '清空确认',
    `确定要清空所有 ${storageType} 数据吗？此操作不可恢复！`,
    () => executeClearAll()
  );
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
      load(); // 重新加载数据
    }
  } catch (error) {
    console.error('Clear failed:', error);
    showToast('清空失败', 'error');
  }
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

// 显示确认对话框
function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  window.pendingAction = callback;
  document.getElementById('confirmModal').classList.remove('hidden');
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

// 简易编辑器
async function openEditor(key,type){
  const items=mode==='local'?data.local:data.session;
  const item=items.find(it=>it.key===key);
  const newVal=prompt(`编辑 ${key} (${type})`,item.value);
  if(newVal!==null){
    chrome.scripting.executeScript({
      target:{tabId:(await chrome.tabs.query({active:true,currentWindow:true}))[0].id},
      func:(st,k,v)=>window[st].setItem(k,v),
      args:[mode=== 'local'?'localStorage':'sessionStorage',key,newVal]
    }).then(()=>{load();});
  }
}

});