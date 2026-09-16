(()=>{
  const loader=document.querySelector('.startup-loader');
  if(!loader)return;
  const auto=loader.dataset.autoHide==="true";
  let closed=false,closing=false;
  const waitForImages=()=>Promise.all([...document.images].filter(img=>img.loading!=="lazy"&&!img.complete).map(img=>new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true})})));
  const close=async()=>{
    if(closed||closing)return;
    closing=true;
    await Promise.race([Promise.all([document.fonts?.ready||Promise.resolve(),waitForImages()]),new Promise(resolve=>setTimeout(resolve,8000))]);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    closed=true;
    loader.classList.add('is-hidden');
    setTimeout(()=>loader.remove(),320);
  };
  window.FestholicLoader={ready:close};
  if(auto){
    window.addEventListener('festholic:panel-ready',close,{once:true});
    setTimeout(()=>{if(!closed){console.warn('Festholic: carga excedió el tiempo de seguridad');close()}},15000);
  }
})();
