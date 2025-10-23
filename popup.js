// 在当前活动标签页注入脚本，读取 storage 并返回
async function getStorageData() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      function detectType(v){
        // 快速检查：如果不是以 { 或 [ 开头，很可能是字符串
        if (!v.startsWith('{') && !v.startsWith('[')) {
          return 'string';
        }
        
        try{
          const p=JSON.parse(v);
          return Array.isArray(p)?'array':typeof p==='object'?'object':typeof p;
        }
        catch{return 'string'}
      }
      
      return {
        local:  Object.entries({...localStorage}).map(([k,v])=>({key:k,value:v,size:new Blob([v]).size,type:detectType(v)})),
        session:Object.entries({...sessionStorage}).map(([k,v])=>({key:k,value:v,size:new Blob([v]).size,type:detectType(v)}))
      };
    }
  });
  console.log(results, 'results');

  // 检查结果是否有效
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
      <button class="edit-button" data-key="${it.key}" data-type="${it.type}">编辑</button>`;
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
    </div>
    <div class="content">
      <div id="list"></div>
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
      filter();
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
  function filter(){
    const kw=search.value.toLowerCase();
    const src=mode==='local'?data.local:data.session;
    const filtered=src.filter(it=>it.key.toLowerCase().includes(kw)||it.value.toLowerCase().includes(kw));
    render(filtered,list);
  }

  btnLocal.addEventListener('click',()=>{
    mode='local';
    btnLocal.classList.add('active');
    btnSession.classList.remove('active');
    filter();
  });
  
  btnSession.addEventListener('click',()=>{
    mode='session';
    btnSession.classList.add('active');
    btnLocal.classList.remove('active');
    filter();
  });
  search.addEventListener('input',filter);
  list.addEventListener('click',e=>{
    if(e.target.tagName==='BUTTON'){
      const key=e.target.dataset.key;
      const type=e.target.dataset.type;
      openEditor(key,type);
    }
  });

  load();

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