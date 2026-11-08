/* ---------- List: production tree ---------- */
function buildList(rows, bal, target){
  // list order as a tree: the target, its ingredients indented below, their ingredients below them, and so on
  const byRid = Object.fromEntries(rows.map(r => [r.rid, r])), seen = new Set(), tree = [];
  const walk = (r, lvl) => { if (seen.has(r.rid)) return; seen.add(r.rid); tree.push({...r, lvl});
    R[r.rid].in.forEach(([i2]) => { const c = byRid[solveRecipe(i2)]; if (c) walk(c, lvl + 1); }); };
  rows.filter(r => target[r.it] !== undefined).forEach(r => walk(r, 0));
  rows.forEach(r => walk(r, 0));
  // tree lines: does the row have a next "sibling" and which levels the ancestors' vertical lines pass through
  const more = tree.map((r, i) => { for (let j = i + 1; j < tree.length; j++) { if (tree[j].lvl < r.lvl) return false; if (tree[j].lvl === r.lvl) return true; } return false; });
  const guides = tree.map((r, i) => { const g = []; for (let k = 1; k < r.lvl; k++) { for (let j = i - 1; j >= 0; j--) if (tree[j].lvl === k) { if (more[j]) g.push(k); break; } } return g; });
  document.getElementById('chainList').innerHTML = rows.length ? tree.map(({rid,x,it,m,lvl}, ti) => {
    const r = R[rid], isT = target[it] !== undefined, outQ = r.out.find(o => o[0] === it)[1]*x;
    const under = Math.abs(m.clk*100 - S.clock) > .05 ? `${t('at')} ${fmt(m.clk*100,1)}%` : '';
    const flows = r.in.map(([i2,a]) => chip(i2, a*x) .replace(/<\/span>$/, expBtn(i2) + '</span>')).concat(r.out.filter(o => o[0] !== it).map(([i2,a]) => chip(i2, a*x, 'by'))).join('');
    return `<div class="c-row${isT ? ' target' : ''}${lvl ? ' sub' : ''}${lvl && more[ti] ? ' more' : ''}" style="--lvl:${lvl}">${guides[ti].map(k => `<i class="tg" style="--k:${k}"></i>`).join('')}
      <div class="prod">${ic(it)}<span class="n"><b>${esc(I[it].n)}</b><small>${fq(outQ)} ${ul(it)}</small></span>${S.expanded.includes(it) ? expBtn(it) : ''}</div>
      <div class="rcell"><button type="button" class="rbtn${r.alt ? ' alt' : ''}" data-menu="${it}" aria-haspopup="listbox" aria-expanded="false"><span>${esc((r.alt ? t('alt') + ': ' : '') + shortName(r))}</span></button><div class="bld">${fmt(m.power,1)} ${t('mw')}</div></div>
      <div class="count"><b class="num">${bimg(m.b,30)}${m.n}${m.shards ? `<span class="shard" title="${t('shardsPer').replace('{a}', m.sh).replace('{b}', m.shards)}"><img src="${IU('Desc_CrystalShard_C')}" alt="${t('shards')}" width="22" height="22">×${m.shards}</span>` : ''}</b><small>${under}</small></div>
      <div class="flows">${flows}</div></div>`;
  }).join('') : `<div class="empty">${t('emptyChain')}</div>`;
}
VIEWS.list = {el: 'chainList', render: buildList};
