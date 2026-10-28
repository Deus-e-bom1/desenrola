/*__rt_WRAP__*/;(function(window,location,document,self){/* Preserva UTM / tracking entre paginas e envia no PIX */
(function(){
  function readStored(){
    try{return JSON.parse(localStorage.getItem('desenrola_params')||'{}');}catch(e){return {};}
  }
  try{
    var q=new URLSearchParams(location.search);
    var stored=readStored();
    var changed=false;
    q.forEach(function(v,k){
      if(v!==null&&v!==undefined&&v!==''){stored[k]=v;changed=true;}
    });
    if(changed){try{localStorage.setItem('desenrola_params',JSON.stringify(stored));}catch(e){}}
    // hidrata dados da consulta de CPF recebidos via URL (redirect de outro projeto/dominio)
    hydrateFromUrl(q);
  }catch(e){}
  function hydrateFromUrl(q){
    try{
      // aceita objeto JSON em ?consulta= ou ?data= (URL-encoded)
      var rawJson=q.get('consulta')||q.get('data')||null;
      var fromJson={};
      if(rawJson){
        try{fromJson=JSON.parse(decodeURIComponent(rawJson));}catch(e2){try{fromJson=JSON.parse(rawJson);}catch(e3){fromJson={};}}
        if(typeof fromJson!=='object'||fromJson===null)fromJson={};
      }
      var cpfRaw=String(q.get('cpf')||q.get('document')||fromJson.cpf||fromJson.cpfformatado||fromJson.document||'');
      var digits=cpfRaw.replace(/\D/g,'');
      var nomeRaw=String(q.get('nome')||fromJson.nome||'').trim();
      var nascRaw=String(q.get('nascimento')||q.get('data_nascimento')||fromJson.nascimento||fromJson.data_nascimento||'').trim();
      if(digits.length===11){
        try{localStorage.setItem('desenrola_cpf',digits);}catch(e){}
        var prev={};
        try{prev=JSON.parse(localStorage.getItem('desenrola_consulta')||'{}');}catch(e){prev={};}
        if(typeof prev!=='object'||prev===null)prev={};
        var fmt=digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
        var merged={};
        Object.keys(prev).forEach(function(k){merged[k]=prev[k];});
        merged.cpf=digits;
        merged.cpfformatado=q.get('cpfformatado')||fromJson.cpfformatado||prev.cpfformatado||fmt;
        if(nomeRaw)merged.nome=nomeRaw;
        else if(fromJson.nome)merged.nome=String(fromJson.nome);
        if(nascRaw)merged.nascimento=nascRaw;
        else if(fromJson.nascimento)merged.nascimento=String(fromJson.nascimento);
        try{localStorage.setItem('desenrola_consulta',JSON.stringify(merged));}catch(e){}
        var finalNome=merged.nome||'';
        if(finalNome){try{localStorage.setItem('desenrola_nome',String(finalNome).toUpperCase());}catch(e){}}
      }else if(nomeRaw){
        try{localStorage.setItem('desenrola_nome',nomeRaw.toUpperCase());}catch(e){}
      }
    }catch(e){}
  }
  function withParams(url){
    try{
      if(!url||url.charAt(0)==='#')return url;
      if(/^https?:\/\//i.test(url))return url;
      if(url.indexOf('/api/')===0)return url;
      var parts=url.split('?');
      var path=parts[0];
      var existing=new URLSearchParams(parts[1]||'');
      var stored=readStored();
      Object.keys(stored).forEach(function(k){if(!existing.has(k))existing.set(k,stored[k]);});
      var s=existing.toString();
      return s?path+'?'+s:path;
    }catch(e){return url;}
  }
  window.__getTracking=function(){return readStored();};
  window.__withParams=withParams;
  // intercepta cliques em QUALQUER link interno relativo (nova estrutura em pastas)
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;
    if(!a)return;
    var href=a.getAttribute('href');
    if(!href)return;
    if(href.charAt(0)==='#')return;                 // ancora
    if(/^https?:/i.test(href))return;                // externo absoluto
    if(/^(mailto:|tel:|javascript:)/i.test(href))return;
    if(href.indexOf('//')===0)return;                // protocol-relative externo
    if(href.indexOf('/api/')===0)return;             // chamada de API
    if(a.target&&a.target!=='' && a.target!=='_self')return; // abre em outra aba
    e.preventDefault();
    window.location.href=withParams(href);
  },true);
})();

}).call(globalThis,(typeof globalThis!=="undefined"&&globalThis.__rt_W)||window,(typeof globalThis!=="undefined"&&globalThis.__rt_L)||location,(typeof globalThis!=="undefined"&&globalThis.__rt_DOC)||document,(typeof globalThis!=="undefined"&&globalThis.__rt_W)||self);