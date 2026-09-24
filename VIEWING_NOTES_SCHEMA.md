# 看屋筆記資料結構

LocalStorage key：`zhonghe-viewing-notes-v1`。陣列每筆一個物件；欄位採用字串或小型物件，避免儲存圖片等大型資料。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["id", "project", "tierOne", "tierTwo", "tierThree", "breakers", "ratings", "tags"],
  "properties": {
    "id": { "type": "string" },
    "project": { "type": "string", "maxLength": 80 },
    "size": { "type": "string", "maxLength": 60 },
    "total": { "type": "string" },
    "parkingPrice": { "type": "string" },
    "deedArea": { "type": "string" },
    "mainArea": { "type": "string" },
    "date": { "type": "string", "format": "date" },
    "text": { "type": "string", "maxLength": 1200 },
    "breakers": { "type": "object", "additionalProperties": { "type": "boolean" } },
    "ratings": { "type": "object", "additionalProperties": { "type": "integer", "minimum": 1, "maximum": 5 } },
    "tags": { "type": "array", "items": { "type": "string" }, "maxItems": 6 },
    "tierOne": { "type": "object", "additionalProperties": { "type": "boolean" } },
    "tierTwo": { "type": "object" },
    "tierThree": { "type": "object" }
  }
}
```

## 390px 橫向比對策略

左側指標欄固定 `100px`；每個物件欄 `155px`，使 390px 螢幕能看見一個完整物件與下一個欄位的提示。右側容器以 `overflow-x:auto`、`scroll-snap-type:x proximity` 支援單手滑動，指標欄以 `position:sticky; left:0` 固定。

```html
<div class="comparison-scroll">
  <div class="comparison-grid">
    <div class="comparison-labels">…固定 100px 指標列…</div>
    <div class="comparison-columns">…155px 寬的物件欄…</div>
  </div>
</div>
```
