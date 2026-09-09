function withAdminPassword(data){
  return Object.assign({},data||{},{password:_adminPass});
}
function adminUrl(url){
  const sep=url.includes('?')?'&':'?';
  return url+sep+'pwd='+encodeURIComponent(_adminPass);
}
