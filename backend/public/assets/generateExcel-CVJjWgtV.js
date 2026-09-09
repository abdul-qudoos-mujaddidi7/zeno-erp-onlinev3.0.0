import{i as B}from"./vendor-iM2kygSn.js";import{t as M,i as L,l as O}from"./index-q9XjAqVJ.js";import{b as X}from"./generatePDF-C3nljnHo.js";let I=!1;const _=(()=>{const e=new Uint32Array(256);for(let t=0;t<256;t+=1){let n=t;for(let l=0;l<8;l+=1)n=n&1?3988292384^n>>>1:n>>>1;e[t]=n>>>0}return e})();function W(e){let t=4294967295;for(let n=0;n<e.length;n+=1)t=_[(t^e[n])&255]^t>>>8;return(t^4294967295)>>>0}function a(e,t,n){e.setUint16(t,n,!0)}function h(e,t,n){e.setUint32(t,n,!0)}function S(e){const t=e.reduce((o,p)=>o+p.length,0),n=new Uint8Array(t);let l=0;return e.forEach(o=>{n.set(o,l),l+=o.length}),n}function H(e){const t=new TextEncoder,n=[],l=[];let o=0;e.forEach(g=>{const u=t.encode(g.name),d=g.data instanceof Uint8Array?g.data:t.encode(g.data),y=W(d),x=new Uint8Array(30+u.length),i=new DataView(x.buffer);h(i,0,67324752),a(i,4,20),a(i,6,0),a(i,8,0),a(i,10,0),a(i,12,0),h(i,14,y),h(i,18,d.length),h(i,22,d.length),a(i,26,u.length),a(i,28,0),x.set(u,30);const F=new Uint8Array(46+u.length),m=new DataView(F.buffer);h(m,0,33639248),a(m,4,20),a(m,6,20),a(m,8,0),a(m,10,0),a(m,12,0),a(m,14,0),h(m,16,y),h(m,20,d.length),h(m,24,d.length),a(m,28,u.length),a(m,30,0),a(m,32,0),a(m,34,0),a(m,36,0),h(m,38,0),h(m,42,o),F.set(u,46),n.push(x,d),l.push(F),o+=x.length+d.length});const p=S(l),r=new Uint8Array(22),c=new DataView(r.buffer);return h(c,0,101010256),a(c,4,0),a(c,6,0),a(c,8,e.length),a(c,10,e.length),h(c,12,p.length),h(c,16,o),a(c,20,0),S([...n,p,r])}function T(e){return String(e??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function C(e){let t=Number(e)+1,n="";for(;t>0;){const l=(t-1)%26;n=String.fromCharCode(65+l)+n,t=Math.floor((t-1)/26)}return n}function Z(e,t){return`${C(e)}${t}`}function j(e){return(String(e||"Report").replace(/[:\\/?*[\]]+/g," ").replace(/\s+/g," ").trim()||"Report").slice(0,31)}function q(e){const t=String(e||"report").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,""),n=new Date().toISOString().slice(0,10);return`ZenoERP-${t||"report"}-${n}.xlsx`}function G(e){const t=String(e||"").length;return Math.min(42,Math.max(12,t+4))}function J(){const e=[],t=new Map;function n(o){const p=String(o??"");if(t.has(p))return t.get(p);const r=e.length;return e.push(p),t.set(p,r),r}function l(o,p,r){return`<c r="${o}" s="${r}" t="s"><v>${n(p)}</v></c>`}return{cell:l,values:e}}function K(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`}function Q(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`}function Y(e){const t=new Date().toISOString();return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${T(e||"ZenoERP")}</dc:title>
  <dc:creator>ZenoERP</dc:creator>
  <cp:lastModifiedBy>ZenoERP</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${t}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${t}</dcterms:modified>
</cp:coreProperties>`}function ee(e){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
</Properties>`}function te(e){return/[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/.test(String(e||""))}function R(e){return e?.rtl||M("dir")==="rtl"||L(B(O))||typeof document<"u"&&document.documentElement?.getAttribute("dir")==="rtl"?!0:[e?.title,e?.companyName,e?.dateRange,...Array.isArray(e?.headers)?e.headers:[],...Array.isArray(e?.metrics)?e.metrics.flatMap(n=>[n?.label,n?.value]):[],...Array.isArray(e?.rows)?e.rows.slice(0,12).flatMap(n=>Array.isArray(n)?n:[]):[]].some(te)}function ne(e){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
</workbook>`}function re(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`}function oe(e){const t=Array.isArray(e)?e:[];return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${t.length}" uniqueCount="${t.length}">
${t.map(n=>{const l=T(n);return`<si><t${/^\s|\s$/.test(String(n||""))?' xml:space="preserve"':""}>${l}</t></si>`}).join("")}
</sst>`}function le(e=!1){const t=e?' readingOrder="2"':' readingOrder="1"',n=e?"right":"center";return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
</styleSheet>`}function k(e,t){const n=Array.isArray(e)?[...e]:[];for(;n.length<t;)n.push("");return n.slice(0,t)}function ae(e){const t=R(e),n=J(),l=Array.isArray(e.metrics)?[...e.metrics]:[],o=Array.isArray(e.headers)?[...e.headers]:[],p=Array.isArray(e.rows)?e.rows:[],r=Math.max(1,l.length,o.length,1),c=k(o,r),g=k(l,r),u=p.map(f=>k(f,r)),d=C(r-1),y=[];let x=1;function i(f,s,w,b=!1){const $=f.slice(0,r).map((z,N)=>n.cell(Z(N,x),z,s)).join(""),V=w?` ht="${w}" customHeight="1"`:"";y.push(`<row r="${x}"${V} spans="1:${r}">${$}</row>`),x+=1}const F=Array.from({length:r},(f,s)=>s===0?e.title||"Report":"");i(F,1,24);const m=Array.from({length:r},(f,s)=>s===0?e.companyName||"ZenoERP":"");if(i(m,2,18),e.dateRange){const f=Array.from({length:r},(s,w)=>w===0?e.dateRange:"");i(f,2,18)}i(Array.from({length:r},()=>""),0,8),l.length&&(i(Array.from({length:r},(f,s)=>g[s]?.label||""),3,18,!0),i(Array.from({length:r},(f,s)=>g[s]?.value||""),4,20,!0),i(Array.from({length:r},()=>""),0,8));const v=x;i(Array.from({length:r},(f,s)=>c[s]||""),3,20,!0),u.forEach((f,s)=>{i(Array.from({length:r},(w,b)=>f[b]||""),s%2===0?4:5,18,!0)});const P=Math.max(1,x-1),E=Array.from({length:r},(f,s)=>[e.title,e.companyName,e.dateRange,g[s]?.label,g[s]?.value,c[s],...u.slice(0,40).map(b=>b[s])].reduce((b,$)=>Math.max(b,G($)),12)).map((f,s)=>`<col min="${s+1}" max="${s+1}" width="${f}" customWidth="1"/>`).join(""),A=[`<mergeCell ref="A1:${d}1"/>`,`<mergeCell ref="A2:${d}2"/>`];e.dateRange&&A.push(`<mergeCell ref="A3:${d}3"/>`);const D=v-1,U=`<sheetView${t?' rightToLeft="1"':""} tabSelected="1" zoomScale="100" zoomScaleNormal="100" workbookViewId="0"><pane ySplit="${D}" topLeftCell="A${v}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${v}" sqref="A${v}"/></sheetView>`;return{sharedStrings:n.values,xml:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${d}${P}"/>
  <sheetViews>
    ${U}
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${E}</cols>
  <sheetData>${y.join("")}</sheetData>
  <mergeCells count="${A.length}">${A.join("")}</mergeCells>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`}}function se(e,t){const n=new Blob([e],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),l=URL.createObjectURL(n),o=document.createElement("a");o.href=l,o.download=t,document.body.appendChild(o),o.click(),o.remove(),URL.revokeObjectURL(l)}async function he(e="sales",t=[],n=null,l=null,o=0,p={},r={}){if(!I){I=!0;try{const c=await X(e,t,n,l,o,p,r),g=j(c.title),u=R(c),d=ae(c),y=H([{name:"[Content_Types].xml",data:K()},{name:"_rels/.rels",data:Q()},{name:"docProps/app.xml",data:ee(g)},{name:"docProps/core.xml",data:Y(c.title)},{name:"xl/workbook.xml",data:ne(g)},{name:"xl/_rels/workbook.xml.rels",data:re()},{name:"xl/styles.xml",data:le(u)},{name:"xl/sharedStrings.xml",data:oe(d.sharedStrings)},{name:"xl/worksheets/sheet1.xml",data:d.xml}]);se(y,q(e))}catch(c){throw console.error("Failed to generate the Excel report:",c),c}finally{I=!1}}}export{he as g};
