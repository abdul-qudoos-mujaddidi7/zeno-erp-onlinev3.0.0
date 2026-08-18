import{i as M}from"./vendor-iM2kygSn.js";import{t as O,i as X,l as L}from"./index-HEZvtMQy.js";import{b as _}from"./generatePDF-TLZ_fqbg.js";let $=!1;const H=(()=>{const e=new Uint32Array(256);for(let t=0;t<256;t+=1){let n=t;for(let l=0;l<8;l+=1)n=n&1?3988292384^n>>>1:n>>>1;e[t]=n>>>0}return e})();function W(e){let t=4294967295;for(let n=0;n<e.length;n+=1)t=H[(t^e[n])&255]^t>>>8;return(t^4294967295)>>>0}function a(e,t,n){e.setUint16(t,n,!0)}function g(e,t,n){e.setUint32(t,n,!0)}function R(e){const t=e.reduce((o,d)=>o+d.length,0),n=new Uint8Array(t);let l=0;return e.forEach(o=>{n.set(o,l),l+=o.length}),n}function Z(e){const t=new TextEncoder,n=[],l=[];let o=0;e.forEach(u=>{const x=t.encode(u.name),f=u.data instanceof Uint8Array?u.data:t.encode(u.data),b=W(f),y=new Uint8Array(30+x.length),p=new DataView(y.buffer);g(p,0,67324752),a(p,4,20),a(p,6,0),a(p,8,0),a(p,10,0),a(p,12,0),g(p,14,b),g(p,18,f.length),g(p,22,f.length),a(p,26,x.length),a(p,28,0),y.set(x,30);const h=new Uint8Array(46+x.length),c=new DataView(h.buffer);g(c,0,33639248),a(c,4,20),a(c,6,20),a(c,8,0),a(c,10,0),a(c,12,0),a(c,14,0),g(c,16,b),g(c,20,f.length),g(c,24,f.length),a(c,28,x.length),a(c,30,0),a(c,32,0),a(c,34,0),a(c,36,0),g(c,38,0),g(c,42,o),h.set(x,46),n.push(y,f),l.push(h),o+=y.length+f.length});const d=R(l),r=new Uint8Array(22),i=new DataView(r.buffer);return g(i,0,101010256),a(i,4,0),a(i,6,0),a(i,8,e.length),a(i,10,e.length),g(i,12,d.length),g(i,16,o),a(i,20,0),R([...n,d,r])}function T(e){return String(e??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function P(e){let t=Number(e)+1,n="";for(;t>0;){const l=(t-1)%26;n=String.fromCharCode(65+l)+n,t=Math.floor((t-1)/26)}return n}function j(e,t){return`${P(e)}${t}`}function q(e){return(String(e||"Report").replace(/[:\\/?*[\]]+/g," ").replace(/\s+/g," ").trim()||"Report").slice(0,31)}function G(e){const t=String(e||"report").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,""),n=new Date().toISOString().slice(0,10);return`ZenoERP-${t||"report"}-${n}.xlsx`}function J(e){const t=String(e||"").length;return Math.min(42,Math.max(12,t+4))}function K(){const e=[],t=new Map;function n(o){const d=String(o??"");if(t.has(d))return t.get(d);const r=e.length;return e.push(d),t.set(d,r),r}function l(o,d,r){return`<c r="${o}" s="${r}" t="s"><v>${n(d)}</v></c>`}return{cell:l,values:e}}function Q(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`}function Y(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`}function ee(e){const t=new Date().toISOString();return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${T(e||"ZenoERP")}</dc:title>
  <dc:creator>ZenoERP</dc:creator>
  <cp:lastModifiedBy>ZenoERP</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${t}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${t}</dcterms:modified>
</cp:coreProperties>`}function te(e){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Excel</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>1</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="1" baseType="lpstr">
      <vt:lpstr>${T(e)}</vt:lpstr>
    </vt:vector>
  </TitlesOfParts>
  <Company>ZenoERP</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0300</AppVersion>
</Properties>`}function ne(e){return/[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(String(e||""))}function E(e){return e?.rtl||O("dir")==="rtl"||X(M(L))||typeof document<"u"&&document.documentElement?.getAttribute("dir")==="rtl"?!0:[e?.title,e?.companyName,e?.dateRange,...Array.isArray(e?.headers)?e.headers:[],...Array.isArray(e?.metrics)?e.metrics.flatMap(n=>[n?.label,n?.value]):[],...Array.isArray(e?.rows)?e.rows.slice(0,12).flatMap(n=>Array.isArray(n)?n:[]):[]].some(ne)}function re(e){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <fileVersion appName="xl" lastEdited="7" lowestEdited="7" rupBuild="11231"/>
  <workbookPr defaultThemeVersion="166925"/>
  <bookViews>
    <workbookView xWindow="0" yWindow="0" windowWidth="27795" windowHeight="12585" tabRatio="600" firstSheet="0" activeTab="0"/>
  </bookViews>
  <sheets>
    <sheet name="${T(e)}" sheetId="1" r:id="rId1"/>
  </sheets>
  <calcPr calcId="191028"/>
</workbook>`}function oe(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`}function le(e){const t=Array.isArray(e)?e:[];return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${t.length}" uniqueCount="${t.length}">
${t.map(n=>{const l=T(n);return`<si><t${/^\s|\s$/.test(String(n||""))?' xml:space="preserve"':""}>${l}</t></si>`}).join("")}
</sst>`}function ae(e=!1){const t=e?' readingOrder="2"':' readingOrder="1"',n=e?"right":"center";return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="11"/><color rgb="FF334155"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF255260"/><name val="Calibri"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF367588"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="${n}" vertical="center"${t}/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"${t}/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"${t}/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${n}" vertical="center" wrapText="1"${t}/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="${n}" vertical="center" wrapText="1"${t}/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${n}" vertical="center" wrapText="1"${t}/></xf>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`}function k(e,t){const n=Array.isArray(e)?[...e]:[];for(;n.length<t;)n.push("");return n.slice(0,t)}function se(e){const t=E(e),n=K(),l=Array.isArray(e.metrics)?[...e.metrics]:[],o=Array.isArray(e.headers)?[...e.headers]:[],d=Array.isArray(e.rows)?e.rows:[],r=Math.max(1,l.length,o.length,1),i=k(o,r),u=k(l,r),x=d.map(m=>k(m,r)),f=P(r-1),b=t?m=>r-1-m:m=>m,y=[];let p=1;function h(m,s,F,w=!1){const I=m.slice(0,r).map((B,C)=>n.cell(j(w?b(C):C,p),B,s)).join(""),N=F?` ht="${F}" customHeight="1"`:"";y.push(`<row r="${p}"${N} spans="1:${r}">${I}</row>`),p+=1}const c=Array.from({length:r},(m,s)=>s===0?e.title||"Report":"");h(c,1,24);const D=Array.from({length:r},(m,s)=>s===0?e.companyName||"ZenoERP":"");if(h(D,2,18),e.dateRange){const m=Array.from({length:r},(s,F)=>F===0?e.dateRange:"");h(m,2,18)}h(Array.from({length:r},()=>""),0,8),l.length&&(h(Array.from({length:r},(m,s)=>u[s]?.label||""),3,18,!0),h(Array.from({length:r},(m,s)=>u[s]?.value||""),4,20,!0),h(Array.from({length:r},()=>""),0,8));const v=p;h(Array.from({length:r},(m,s)=>i[s]||""),3,20,!0),x.forEach((m,s)=>{h(Array.from({length:r},(F,w)=>m[w]||""),s%2===0?4:5,18,!0)});const U=Math.max(1,p-1),S=Array.from({length:r},(m,s)=>[e.title,e.companyName,e.dateRange,u[s]?.label,u[s]?.value,i[s],...x.slice(0,40).map(w=>w[s])].reduce((w,I)=>Math.max(w,J(I)),12)),V=(t?S.slice().reverse():S).map((m,s)=>`<col min="${s+1}" max="${s+1}" width="${m}" customWidth="1"/>`).join(""),A=[`<mergeCell ref="A1:${f}1"/>`,`<mergeCell ref="A2:${f}2"/>`];e.dateRange&&A.push(`<mergeCell ref="A3:${f}3"/>`);const z=`<sheetView tabSelected="1" zoomScale="100" zoomScaleNormal="100" workbookViewId="0"><pane ySplit="${v-1}" topLeftCell="A${v}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${v}" sqref="A${v}"/></sheetView>`;return{sharedStrings:n.values,xml:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${f}${U}"/>
  <sheetViews>
    ${z}
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${V}</cols>
  <sheetData>${y.join("")}</sheetData>
  <mergeCells count="${A.length}">${A.join("")}</mergeCells>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`}}function ie(e,t){const n=new Blob([e],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),l=URL.createObjectURL(n),o=document.createElement("a");o.href=l,o.download=t,document.body.appendChild(o),o.click(),o.remove(),URL.revokeObjectURL(l)}async function he(e="sales",t=[],n=null,l=null,o=0,d={},r={}){if(!$){$=!0;try{const i=await _(e,t,n,l,o,d,r),u=q(i.title),x=E(i),f=se(i),b=Z([{name:"[Content_Types].xml",data:Q()},{name:"_rels/.rels",data:Y()},{name:"docProps/app.xml",data:te(u)},{name:"docProps/core.xml",data:ee(i.title)},{name:"xl/workbook.xml",data:re(u)},{name:"xl/_rels/workbook.xml.rels",data:oe()},{name:"xl/styles.xml",data:ae(x)},{name:"xl/sharedStrings.xml",data:le(f.sharedStrings)},{name:"xl/worksheets/sheet1.xml",data:f.xml}]);ie(b,G(e))}catch(i){throw console.error("Failed to generate the Excel report:",i),i}finally{$=!1}}}export{he as g};
