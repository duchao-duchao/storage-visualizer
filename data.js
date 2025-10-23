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