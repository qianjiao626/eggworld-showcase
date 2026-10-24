/* 聊天室后台治理：举报、敏感词、禁言。只使用 textContent 渲染。 */
(function(){
'use strict';
function token(){return (window.sessionStorage&&sessionStorage.getItem('token'))||''}
function api(path,method,body){var base=(typeof API_BASE==='string')?API_BASE:'';return fetch(base+path,{method:method||'GET',headers:Object.assign({'Content-Type':'application/json'},token()?{'Authorization':'Bearer '+token()}:{}),body:body===undefined?undefined:JSON.stringify(body)}).then(function(r){return r.json()}).then(function(x){if(x.code!==200)throw new Error(x.msg||'请求失败');return x.data})}
function el(id){return document.getElementById(id)}
function renderReports(rows){var box=el('chatAdminReports');if(!box)return;box.replaceChildren();(rows||[]).forEach(function(r){var d=document.createElement('div');d.className='chat-admin-row';var t=document.createElement('b');t.textContent='#'+r.id+' '+r.reason;d.appendChild(t);var s=document.createElement('span');s.textContent='状态：'+(r.status||'open');d.appendChild(s);var a=document.createElement('button');a.className='btn btn-ghost';a.type='button';a.textContent='标记处理中';a.onclick=function(){handle(r.id,'processing')};d.appendChild(a);var b=document.createElement('button');b.className='btn btn-primary';b.type='button';b.textContent='标记已解决';b.onclick=function(){handle(r.id,'resolved')};d.appendChild(b);box.appendChild(d)})}
function renderWords(rows){var box=el('chatAdminWords');if(!box)return;box.replaceChildren();(rows||[]).forEach(function(w){var d=document.createElement('div');d.className='chat-admin-row';var t=document.createElement('b');t.textContent=w.word;d.appendChild(t);var s=document.createElement('span');s.textContent=w.level==='block'?'直接拦截':'提示修改';d.appendChild(s);var b=document.createElement('button');b.className='btn btn-ghost';b.type='button';b.textContent='删除';b.onclick=function(){removeWord(w.id)};d.appendChild(b);box.appendChild(d)})}
function load(){api('/api/admin/chat/reports?status=open').then(renderReports).catch(function(){});api('/api/admin/chat/sensitive-words').then(renderWords).catch(function(){})}
function handle(id,status){api('/api/admin/chat/reports/'+id+'?status='+status,'POST').then(load)}
function addWord(){var i=el('chatAdminNewWord');var v=i?i.value.trim():'';if(!v)return;api('/api/admin/chat/sensitive-words','POST',{word:v,level:(el('chatAdminNewLevel')||{}).value||'review',enabled:1}).then(function(){i.value='';load()})}
function removeWord(id){api('/api/admin/chat/sensitive-words/'+id,'DELETE').then(load)}
function mute(){var u=el('chatAdminMuteUser'),m=el('chatAdminMuteMinutes');if(!u||!m)return;api('/api/admin/chat/mutes/global','POST',{userId:Number(u.value),minutes:Number(m.value),reason:'管理员操作'}).then(function(){u.value='';m.value='';load()})}
window.chatroomAdminLoad=load;window.chatroomAdminMute=mute;window.chatroomAdminAddWord=addWord;window.chatroomAdminRemoveWord=removeWord;
})();

