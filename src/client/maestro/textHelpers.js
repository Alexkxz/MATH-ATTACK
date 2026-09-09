function esc(s){ const d=document.createElement('div'); d.textContent=s||''; return d.innerHTML; }

function repairMojibakeValue(value){
  if(typeof value!=="string"||!value) return value;
  const suspicious=/[ÃÂâðïœžŸ¢€™]/;
  const decodeLatin1Utf8=input=>{
    try{
      // The damaged text includes Windows-1252 punctuation (for example, en dashes).
      // Convert those code points back to their original byte before decoding as UTF-8.
      const cp1252Bytes=new Map([[0x20ac,0x80],[0x201a,0x82],[0x192,0x83],[0x201e,0x84],[0x2026,0x85],[0x2020,0x86],[0x2021,0x87],[0x2c6,0x88],[0x2030,0x89],[0x160,0x8a],[0x2039,0x8b],[0x152,0x8c],[0x17d,0x8e],[0x2018,0x91],[0x2019,0x92],[0x201c,0x93],[0x201d,0x94],[0x2022,0x95],[0x2013,0x96],[0x2014,0x97],[0x2dc,0x98],[0x2122,0x99],[0x161,0x9a],[0x203a,0x9b],[0x153,0x9c],[0x17e,0x9e],[0x178,0x9f]]);
      const bytes=Uint8Array.from(Array.from(input,ch=>{
        const code=ch.charCodeAt(0);
        return code<=255?code:(cp1252Bytes.get(code)??0x3f);
      }));
      return new TextDecoder("utf-8",{fatal:false}).decode(bytes);
    }catch(e){
      return input;
    }
  };
  const replacements=[
    ["\u00c2\u00bf","\u00bf"],["\u00c2\u00a1","\u00a1"],
    ["\u00c3\u00a1","\u00e1"],["\u00c3\u00a9","\u00e9"],["\u00c3\u00ad","\u00ed"],["\u00c3\u00b3","\u00f3"],["\u00c3\u00ba","\u00fa"],
    ["\u00c3\u0081","\u00c1"],["\u00c3\u0089","\u00c9"],["\u00c3\u008d","\u00cd"],["\u00c3\u201c","\u00d3"],["\u00c3\u0161","\u00da"],
    ["\u00c3\u00b1","\u00f1"],["\u00c3\u2018","\u00d1"],["\u00c3\u00bc","\u00fc"],["\u00c3\u0153","\u00dc"],
    ["\u00c3\u2014","\u00d7"],["\u00e2\u02c6\u2019","\u2212"],["\u00c3\u00b7","\u00f7"],
    ["\u00e2\u20ac\u201d","\u2014"],["\u00e2\u20ac\u201c","\u2013"],["\u00e2\u2020\u2019","\u2192"],
    ["\u00e2\u0153\u2026","\u2705"],["\u00e2\u009d\u0152","\u274c"],["\u00e2\u0161\u00a1","\u26a1"],["\u00e2\u008f\u00b0","\u23f0"],["\u00e2\u008f\u00b3","\u23f3"],
    ["\u00e2\u008f\u00ad\u00ef\u00b8\u008f","\u23ed\ufe0f"],["\u00e2\u008f\u00b1\u00ef\u00b8\u008f","\u23f1\ufe0f"],["\u00e2\u0153\u00a8","\u2728"],["\u00e2\u0153\u2013\u00ef\u00b8\u008f","\u2716\ufe0f"],
    ["\u00e2\u009d\u201e\u00ef\u00b8\u008f","\u2744\ufe0f"],["\u00e2\u009d\u00a4\u00ef\u00b8\u008f\u00e2\u20ac\u008d\u00f0\u0178\u00a9\u00b9","\u2764\ufe0f\u200d\ud83e\ude79"],["\u00e2\u009d\u00a4\u00ef\u00b8\u008f","\u2764\ufe0f"],["\u00e2\u009d\u00a4","\u2764"],
    ["\u00f0\u0178\u201c\u00a4","\ud83d\udda4"],["\u00e2\u00ad\u0090","\u2b50"],["\u00f0\u0178\u2019\u00af","\ud83d\udcaf"],["\u00f0\u0178\u201d\u00a5","\ud83d\udd25"],
    ["\u00e2\u017e\u2022","\u2795"],["\u00e2\u017e\u2013","\u2796"],["\u00e2\u017e\u2014","\u2797"],["\u00f0\u0178\u017d\u00ae","\ud83c\udfae"],["\u00f0\u0178\u008f\u00a0","\ud83c\udfe0"],
    ["\u00f0\u0178\u2018\u00a5","\ud83d\udc65"],["\u00f0\u0178\u2018\u00a4","\ud83d\udc64"],["\u00f0\u0178\u201c\u00b6","\ud83d\udcf6"],["\u00f0\u0178\u201c\u00a2","\ud83d\udce2"],["\u00f0\u0178\u201c\u2039","\ud83d\udccb"],
    ["\u00f0\u0178\u2019\u00a3","\ud83d\udca3"],["\u00f0\u0178\u201d\u2019","\ud83d\udd12"],["\u00f0\u0178\u201d\u201e","\ud83d\udd04"],["\u00f0\u0178\u2019\u00b4","\ud83d\udcb4"],["\u00f0\u0178\u00aa\u2122","\ud83e\ude99"],
    ["\u00f0\u0178\u00a7\u00b2","\ud83e\uddf2"],["\u00f0\u0178\u0090\u0152","\ud83d\udc0c"],["\u00f0\u0178\u017d\u00b2","\ud83c\udfb2"],["\u00f0\u0178\u008f\u201c","\ud83c\udfd3"],["\u00f0\u0178\u00aa\u017e","\ud83e\ude9e"],
    ["\u00f0\u0178\u2019\u00b8","\ud83d\udcb8"],["\u00f0\u0178\u0152\u20ac","\ud83c\udf00"],["\u00f0\u0178\u0152\u0081","\ud83c\udf01"],["\u00f0\u0178\u0152\u2018","\ud83c\udf11"],["\u00f0\u0178\u2019\u20ac","\ud83d\udc80"],["\u00f0\u0178\u008f\u00b7\u00ef\u00b8\u008f","\ud83c\udff7\ufe0f"],
    ["\u00f0\u0178\u2018\u0081","\ud83d\udc41"],["\u00f0\u0178\u00a4\u2013","\ud83e\udd16"],["\u00f0\u0178\u00a7\u2018","\ud83e\uddd1"],["\u00f0\u0178\u00a7\u00a0","\ud83e\udde0"],["\u00f0\u0178\u201d\u2014","\ud83d\udd17"],
    ["\u00f0\u0178\u008f\u00ab","\ud83c\udfeb"],["\u00f0\u0178\u201c\u009d","\ud83d\udcdd"],["\u00f0\u0178\u017d\u2030","\ud83c\udf89"],["\u00f0\u0178\u2019\u00aa","\ud83d\udcaa"],["\u00f0\u0178\u201c\u2013","\ud83d\udcd6"],
    ["\u00f0\u0178\u00a4\u00ab","\ud83e\udd2b"],["\u00f0\u0178\u2018\u008f","\ud83d\udc4f"],["\u00f0\u0178\u017d\u201a","\ud83c\udf82"],["\u00f0\u0178\u00a5\u2021","\ud83e\udd47"],["\u00f0\u0178\u00a5\u02c6","\ud83e\udd48"],
    ["\u00f0\u0178\u00a5\u2030","\ud83e\udd49"],["4\u00ef\u00b8\u008f\u20e3","4️⃣"],["\u00f0\u0178\u0178\u0160","\ud83d\udeaa"],["\u00f0\u0178\u0178\u00ab","\ud83d\udeab"],["\u00f0\u0178\u201d\u00b4","\ud83d\udd34"],
    ["\u00f0\u0178\u0178\u00a1","\ud83d\udfe1"],["\u00f0\u0178\u0178\u00a2","\ud83d\udfe2"],["\u00f0\u0178\u2018\u008d\u00ef\u00b8\u008f","\ud83d\udc41\ufe0f"],
    ["\u00f0\u0178\u00aa\u2122","\ud83e\ude99"],["\u00f0\u0178\u017d\u00ad","\ud83c\udfad"],["\u00f0\u0178\u008f\u00aa","\ud83c\udfea"],["\u00f0\u0178\u2019\u00b6","\ud83d\udcb6"],
    ["\u00f0\u0178\u2013\u00a5","\ud83d\udda5"],["\u00f0\u0178\u201d\u2018","\ud83d\udd11"],["\u00f0\u0178\u2014\u2018","\ud83d\udd0f"],["\u00f0\u0178\u201c\u00a5","\ud83d\udce5"],
    ["\u00f0\u0178\u2014\u2019","\ud83d\udd10"],["\u00f0\u0178\u201c\u0161","\ud83d\uddd1"],["\u00f0\u0178\u2018\u00a8","\ud83d\udc68"],["\u00f0\u0178\u2018\u00a9","\ud83d\udc69"],
    ["\u00e2\u2020\u0090","\u2190"],["\u00e2\u0153\u2022","\u2714"],["\u00e2\u0153\u201c","\u2716"]
  ];
  let next=value;
  for(let i=0;i<2&&suspicious.test(next);i++){
    const decoded=decodeLatin1Utf8(next);
    if(decoded&&decoded!==next) next=decoded;
  }
  for(const [bad,good] of replacements) next=next.replaceAll(bad,good);
  return next;
}
function repairMojibakeNode(root){
  if(!root) return;
  const fixText=node=>{
    const next=repairMojibakeValue(node.nodeValue);
    if(next!==node.nodeValue) node.nodeValue=next;
  };
  const fixAttrs=el=>{
    if(!el.attributes) return;
    for(const attr of Array.from(el.attributes)){
      const next=repairMojibakeValue(attr.value);
      if(next!==attr.value) el.setAttribute(attr.name,next);
    }
  };
  if(root.nodeType===Node.TEXT_NODE){ fixText(root); return; }
  if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE) return;
  if(root.nodeType===Node.ELEMENT_NODE) fixAttrs(root);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
  let node=walker.currentNode;
  while(node){
    if(node.nodeType===Node.TEXT_NODE) fixText(node); else fixAttrs(node);
    node=walker.nextNode();
  }
}
function installMojibakeRepair(){
  if(window.__mojibakeRepairInstalled) return;
  window.__mojibakeRepairInstalled=true;
  repairMojibakeNode(document.body);
  document.title=repairMojibakeValue(document.title);
  const observer=new MutationObserver(mutations=>{
    for(const m of mutations){
      if(m.type==="characterData"||m.type==="attributes"){ repairMojibakeNode(m.target); continue; }
      for(const node of m.addedNodes) repairMojibakeNode(node);
    }
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
}
