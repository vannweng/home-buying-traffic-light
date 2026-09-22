// User-provided priorities translated into an explicit heuristic, not a price forecast.
export const CRITERIA = [
  { rank: 1, tier: '一票否決', title: '嫌惡設施與地質安全', weight: 0, reason: '斷層、淹水、宮廟或高架第一排等需逐址查證，部分風險無法靠裝潢改善。', psychology: '只要踩雷，再便宜都難以接受。' },
  { rank: 2, tier: '硬性剛需', title: '捷運／軌道交通', weight: 18, reason: '交通可擴大潛在買盤，但須確認實際步行距離、通車狀態及價格是否已反映。', psychology: '買房買地點，捷運常是流動性考量。' },
  { rank: 3, tier: '硬性剛需', title: '室內採光通風與格局', weight: 12, reason: '棟距、暗房、柱位與壓樑影響日常使用，現場與圖面皆需檢查。', psychology: '住進去舒不舒服，先看採光與壓迫感。' },
  { rank: 4, tier: '硬性剛需', title: '日常民生採買', weight: 9, reason: '超市、便利商店與市場的實際步行可達性影響高頻生活需求。', psychology: '可以不逛街，但常需要買菜補貨。' },
  { rank: 5, tier: '硬性剛需', title: '車位型態', weight: 9, reason: '坡道平面與機械車位的使用便利、維護及轉手接受度可能不同。', psychology: '車位好不好用，往往影響買方決定。' },
  { rank: 6, tier: '保值與品質', title: '學區', weight: 8, reason: '學區可影響家庭客需求，但入學資格、學額與政策需逐年查核。', psychology: '未來轉手也會考慮家庭客。' },
  { rank: 7, tier: '保值與品質', title: '公園綠地與開闊棟距', weight: 8, reason: '綠地及棟距影響視野與活動空間，仍要確認可達性與未來遮蔽。', psychology: '下班與假日希望有綠意。' },
  { rank: 8, tier: '保值與品質', title: '社區物業與梯戶比', weight: 8, reason: '管委會、垃圾處理與電梯服務影響持續居住品質及管理成本。', psychology: '擔心社區管理隨時間變差。' },
  { rank: 9, tier: '保值與品質', title: '街廓規劃與人行道', weight: 7, reason: '人車動線與步行安全影響長期使用體驗。', psychology: '希望推嬰兒車或步行時不用與車爭道。' },
  { rank: 10, tier: '加分與特定週期', title: '建商品牌與營造品質', weight: 6, reason: '施工、保固與口碑需看具體紀錄，品牌溢價也可能已在開價中。', psychology: '願意為可信品質加價，但仍有預算上限。' },
  { rank: 11, tier: '加分與特定週期', title: '百貨商圈', weight: 5, reason: '休閒餐飲方便，但過近也可能帶來噪音及人潮。', psychology: '希望離塵不離城。' },
  { rank: 12, tier: '加分與特定週期', title: '大型醫療資源', weight: 5, reason: '就醫可達性有益，仍須留意急診車流與噪音。', psychology: '希望近而不貼。' },
  { rank: 13, tier: '加分與特定週期', title: '社區休閒公設', weight: 5, reason: '實用性需與管理費、維護成本一起衡量。', psychology: '公設實用、不增加太多持有成本。' },
];

export function scoreAppreciation(answers = {}) {
  const invalid = Object.entries(answers).some(([rank, value]) => !CRITERIA.some((item) => String(item.rank) === rank) || !['yes', 'no', 'unknown'].includes(value));
  if (invalid) throw new Error('評估答案格式不符。');
  const veto = answers[1] || 'unknown';
  const weighted = CRITERIA.filter((item) => item.weight);
  const earned = weighted.reduce((sum, item) => sum + (answers[item.rank] === 'yes' ? item.weight : 0), 0);
  const assessed = weighted.reduce((sum, item) => sum + (['yes', 'no'].includes(answers[item.rank]) ? item.weight : 0), 0);
  const range = [earned, earned + 100 - assessed];
  return { veto, earned, assessed, range, score: veto === 'yes' && assessed >= 70 ? earned : null };
}
