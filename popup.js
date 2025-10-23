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

async function load(){
  try {
    data=await getStorageData();
    updateStorageSizes(data); // 更新存储大小显示
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

// 全局变量
var data={local:[],session:[]};
var mode='local';
var list, search, btnLocal, btnSession;

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
        <button id="tabLocal" class="tab-button active">
          localStorage
          <span id="localSize" class="storage-size">0KB</span>
        </button>
        <button id="tabSession" class="tab-button">
          sessionStorage
          <span id="sessionSize" class="storage-size">0KB</span>
        </button>
      </div>
      <input id="search" class="search-input" placeholder="搜索键名或值..."/>
      <div class="search-filters">
        <select id="typeFilter" class="filter-select">
          <option value="">所有类型</option>
          <option value="string">字符串</option>
          <option value="object">对象</option>
          <option value="array">数组</option>
          <option value="number">数字</option>
          <option value="boolean">布尔值</option>
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
    </div>
    
    <!-- 编辑模态框 -->
    <div id="editModal" class="modal hidden">
      <div class="modal-content edit-modal">
        <div class="modal-header">
          <span id="editTitle">编辑存储项</span>
          <button id="closeEdit" class="close-button">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">键名</label>
            <input id="editKey" class="form-input" readonly />
          </div>
          <div class="form-group">
            <label class="form-label">类型</label>
            <span id="editType" class="type-display"></span>
          </div>
          <div class="form-group">
            <label class="form-label">值</label>
            <textarea id="editValue" class="form-textarea" rows="8" placeholder="请输入值..."></textarea>
          </div>
          <div class="edit-tips">
            <div class="tip-item">
              <span class="tip-icon">💡</span>
              <span>对象和数组请使用有效的JSON格式</span>
            </div>
            <div class="tip-item">
              <span class="tip-icon">📏</span>
              <span id="valueLength">字符数: 0</span>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button id="cancelEdit" class="modal-button secondary">取消</button>
          <button id="saveEdit" class="modal-button primary">保存</button>
        </div>
      </div>
    </div>`;

  // 初始化全局变量
  search = document.getElementById('search');
  list = document.getElementById('list');
  btnLocal = document.getElementById('tabLocal');
  btnSession=document.getElementById('tabSession');

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
          openEditor(key, e.target.dataset.type);
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

  // 编辑模态框事件
  document.getElementById('closeEdit').addEventListener('click', closeEditModal);
  document.getElementById('cancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('saveEdit').addEventListener('click', saveEdit);
  
  // 编辑值输入事件
  document.getElementById('editValue').addEventListener('input', updateValueLength);
  
  // 编辑值实时验证
  document.getElementById('editValue').addEventListener('input', () => {
    const type = document.getElementById('editType').textContent;
    const value = document.getElementById('editValue').value;
    const validation = validateJSON(value, type);
    const textarea = document.getElementById('editValue');
    
    // 移除之前的验证消息
    const existingMessage = document.querySelector('.validation-message');
    if (existingMessage) {
      existingMessage.remove();
    }
    
    if (type === 'object' || type === 'array') {
      if (validation.valid) {
        textarea.classList.add('valid');
        textarea.classList.remove('invalid');
      } else {
        textarea.classList.add('invalid');
        textarea.classList.remove('valid');
      }
    }
  });
  
  // ESC键关闭编辑模态框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const editModal = document.getElementById('editModal');
      if (!editModal.classList.contains('hidden')) {
        closeEditModal();
      }
    }
  });

  load();

});