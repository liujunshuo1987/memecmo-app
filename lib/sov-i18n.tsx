"use client"

import { createContext, useContext, useState, ReactNode } from "react"

export type SovLanguage = "en" | "zh" | "th" | "vi" | "lo" | "km" | "id" | "ms"

export const sovLanguages: { code: SovLanguage; name: string; nativeName: string; flag: string }[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "th", name: "Thai", nativeName: "ไทย", flag: "🇹🇭" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt", flag: "🇻🇳" },
  { code: "lo", name: "Lao", nativeName: "ລາວ", flag: "🇱🇦" },
  { code: "km", name: "Khmer", nativeName: "ខ្មែរ", flag: "🇰🇭" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu", flag: "🇲🇾" },
]

type SovTranslationKey =
  | "brand" | "agentStatus" | "online" | "lastSync"
  | "totalAIMentions" | "days30" | "positiveSentimentRatio" | "aboveIndustryAvg"
  | "competitorInterceptionRate" | "queriesIntercepted"
  | "aiModelPerformanceMatrix" | "brandVisibilityAcross"
  | "brandSOVTrend" | "shareOfVoiceLast30Days" | "sovPercent" | "mentions"
  | "liveIntelligenceFeed" | "realTimeAIAgentMonitoring" | "live"
  | "time" | "aiModel" | "sentiment" | "intelligenceSummary"
  | "showingLatest" | "intelligenceEvents" | "positive" | "neutral" | "negative"
  | "createNewAEOCampaign" | "configureYourCampaign" | "targetBrand" | "enterBrandName"
  | "brandOptimizeDescription" | "questionSet" | "bulkPaste" | "fileUpload"
  | "enterOneQuestionPerLine" | "questions" | "dragAndDrop" | "browse"
  | "supportsCsvExcel" | "launchMatrixEngine" | "campaignWillBeProcessed"

const translations: Record<SovLanguage, Record<SovTranslationKey, string>> = {
  en: {
    brand: "Brand", agentStatus: "Agent Status", online: "Online", lastSync: "Last sync",
    totalAIMentions: "Total AI Mentions", days30: "30d", positiveSentimentRatio: "Positive Sentiment Ratio",
    aboveIndustryAvg: "Above industry avg", competitorInterceptionRate: "Competitor Interception Rate",
    queriesIntercepted: "Queries intercepted by competitors",
    aiModelPerformanceMatrix: "AI Model Performance Matrix",
    brandVisibilityAcross: "Brand visibility across major AI platforms",
    brandSOVTrend: "Brand SOV Trend", shareOfVoiceLast30Days: "Share of Voice over the last 30 days",
    sovPercent: "SOV %", mentions: "Mentions", liveIntelligenceFeed: "Live Intelligence Feed",
    realTimeAIAgentMonitoring: "Real-time AI agent monitoring across platforms",
    live: "Live", time: "Time", aiModel: "AI Model", sentiment: "Sentiment",
    intelligenceSummary: "Intelligence Summary", showingLatest: "Showing latest",
    intelligenceEvents: "intelligence events", positive: "Positive", neutral: "Neutral", negative: "Negative",
    createNewAEOCampaign: "Create New AEO Campaign",
    configureYourCampaign: "Configure your AI Engine Optimization campaign parameters",
    targetBrand: "Target Brand", enterBrandName: "Enter brand name (e.g., MEMECMO)",
    brandOptimizeDescription: "The brand you want to optimize for AI search engines",
    questionSet: "Question Set", bulkPaste: "Bulk Paste", fileUpload: "File Upload",
    enterOneQuestionPerLine: "Enter one question per line, max 20 lines", questions: "questions",
    dragAndDrop: "Drag and drop your file here, or", browse: "browse",
    supportsCsvExcel: "Supports CSV and Excel files (.csv, .xlsx, .xls)",
    launchMatrixEngine: "Launch Matrix Engine",
    campaignWillBeProcessed: "Campaign will be processed across ChatGPT, Perplexity, and Gemini",
  },
  zh: {
    brand: "品牌", agentStatus: "代理状态", online: "在线", lastSync: "最后同步",
    totalAIMentions: "AI 总提及量", days30: "30天", positiveSentimentRatio: "正面情绪比率",
    aboveIndustryAvg: "高于行业平均水平", competitorInterceptionRate: "竞争对手拦截率",
    queriesIntercepted: "被竞争对手拦截的查询",
    aiModelPerformanceMatrix: "AI 模型性能矩阵",
    brandVisibilityAcross: "主要 AI 平台的品牌可见度",
    brandSOVTrend: "品牌 SOV 趋势", shareOfVoiceLast30Days: "过去 30 天的声量份额",
    sovPercent: "SOV 百分比", mentions: "提及量", liveIntelligenceFeed: "实时情报流",
    realTimeAIAgentMonitoring: "跨平台实时 AI 代理监控",
    live: "实时", time: "时间", aiModel: "AI 模型", sentiment: "情绪",
    intelligenceSummary: "情报摘要", showingLatest: "显示最新",
    intelligenceEvents: "条情报事件", positive: "正面", neutral: "中性", negative: "负面",
    createNewAEOCampaign: "创建新 AEO 测试任务",
    configureYourCampaign: "配置您的 AI 引擎优化活动参数",
    targetBrand: "目标品牌", enterBrandName: "输入品牌名称（例如：MEMECMO）",
    brandOptimizeDescription: "您想在 AI 搜索引擎中优化的品牌",
    questionSet: "问题集", bulkPaste: "批量粘贴", fileUpload: "文件上传",
    enterOneQuestionPerLine: "每行输入一个问题，最多 20 行", questions: "个问题",
    dragAndDrop: "将文件拖放到此处，或", browse: "浏览",
    supportsCsvExcel: "支持 CSV 和 Excel 文件（.csv、.xlsx、.xls）",
    launchMatrixEngine: "启动矩阵引擎",
    campaignWillBeProcessed: "测试任务将在 ChatGPT、Perplexity 和 Gemini 上处理",
  },
  th: {
    brand: "แบรนด์", agentStatus: "สถานะเอเจนต์", online: "ออนไลน์", lastSync: "ซิงค์ล่าสุด",
    totalAIMentions: "การกล่าวถึง AI ทั้งหมด", days30: "30 วัน", positiveSentimentRatio: "อัตราความรู้สึกเชิงบวก",
    aboveIndustryAvg: "สูงกว่าค่าเฉลี่ยอุตสาหกรรม", competitorInterceptionRate: "อัตราการสกัดกั้นของคู่แข่ง",
    queriesIntercepted: "การค้นหาที่ถูกคู่แข่งสกัดกั้น",
    aiModelPerformanceMatrix: "เมทริกซ์ประสิทธิภาพโมเดล AI",
    brandVisibilityAcross: "การมองเห็นแบรนด์บนแพลตฟอร์ม AI หลัก",
    brandSOVTrend: "แนวโน้ม SOV ของแบรนด์", shareOfVoiceLast30Days: "ส่วนแบ่งเสียงใน 30 วันที่ผ่านมา",
    sovPercent: "SOV %", mentions: "การกล่าวถึง", liveIntelligenceFeed: "ฟีดข่าวกรองสด",
    realTimeAIAgentMonitoring: "การตรวจสอบเอเจนต์ AI แบบเรียลไทม์ข้ามแพลตฟอร์ม",
    live: "สด", time: "เวลา", aiModel: "โมเดล AI", sentiment: "ความรู้สึก",
    intelligenceSummary: "สรุปข่าวกรอง", showingLatest: "แสดงล่าสุด",
    intelligenceEvents: "เหตุการณ์ข่าวกรอง", positive: "บวก", neutral: "กลาง", negative: "ลบ",
    createNewAEOCampaign: "สร้างแคมเปญ AEO ใหม่",
    configureYourCampaign: "กำหนดค่าพารามิเตอร์แคมเปญการเพิ่มประสิทธิภาพ AI Engine",
    targetBrand: "แบรนด์เป้าหมาย", enterBrandName: "ป้อนชื่อแบรนด์ (เช่น MEMECMO)",
    brandOptimizeDescription: "แบรนด์ที่คุณต้องการเพิ่มประสิทธิภาพสำหรับเครื่องมือค้นหา AI",
    questionSet: "ชุดคำถาม", bulkPaste: "วางแบบกลุ่ม", fileUpload: "อัปโหลดไฟล์",
    enterOneQuestionPerLine: "ป้อนคำถามหนึ่งข้อต่อบรรทัด สูงสุด 20 บรรทัด", questions: "คำถาม",
    dragAndDrop: "ลากและวางไฟล์ที่นี่ หรือ", browse: "เรียกดู",
    supportsCsvExcel: "รองรับไฟล์ CSV และ Excel (.csv, .xlsx, .xls)",
    launchMatrixEngine: "เปิดใช้งานเครื่องมือเมทริกซ์",
    campaignWillBeProcessed: "แคมเปญจะถูกประมวลผลบน ChatGPT, Perplexity และ Gemini",
  },
  vi: {
    brand: "Thương hiệu", agentStatus: "Trạng thái Agent", online: "Trực tuyến", lastSync: "Đồng bộ lần cuối",
    totalAIMentions: "Tổng lượt đề cập AI", days30: "30 ngày", positiveSentimentRatio: "Tỷ lệ cảm xúc tích cực",
    aboveIndustryAvg: "Trên mức trung bình ngành", competitorInterceptionRate: "Tỷ lệ chặn của đối thủ",
    queriesIntercepted: "Truy vấn bị đối thủ chặn",
    aiModelPerformanceMatrix: "Ma trận hiệu suất mô hình AI",
    brandVisibilityAcross: "Khả năng hiển thị thương hiệu trên các nền tảng AI chính",
    brandSOVTrend: "Xu hướng SOV thương hiệu", shareOfVoiceLast30Days: "Thị phần tiếng nói trong 30 ngày qua",
    sovPercent: "SOV %", mentions: "Lượt đề cập", liveIntelligenceFeed: "Nguồn cấp tin tình báo trực tiếp",
    realTimeAIAgentMonitoring: "Giám sát agent AI theo thời gian thực trên các nền tảng",
    live: "Trực tiếp", time: "Thời gian", aiModel: "Mô hình AI", sentiment: "Cảm xúc",
    intelligenceSummary: "Tóm tắt tình báo", showingLatest: "Hiển thị mới nhất",
    intelligenceEvents: "sự kiện tình báo", positive: "Tích cực", neutral: "Trung lập", negative: "Tiêu cực",
    createNewAEOCampaign: "Tạo chiến dịch AEO mới",
    configureYourCampaign: "Cấu hình tham số chiến dịch tối ưu hóa AI Engine",
    targetBrand: "Thương hiệu mục tiêu", enterBrandName: "Nhập tên thương hiệu (ví dụ: MEMECMO)",
    brandOptimizeDescription: "Thương hiệu bạn muốn tối ưu hóa cho công cụ tìm kiếm AI",
    questionSet: "Bộ câu hỏi", bulkPaste: "Dán hàng loạt", fileUpload: "Tải lên tệp",
    enterOneQuestionPerLine: "Nhập một câu hỏi mỗi dòng, tối đa 20 dòng", questions: "câu hỏi",
    dragAndDrop: "Kéo và thả tệp vào đây, hoặc", browse: "duyệt",
    supportsCsvExcel: "Hỗ trợ tệp CSV và Excel (.csv, .xlsx, .xls)",
    launchMatrixEngine: "Khởi chạy Matrix Engine",
    campaignWillBeProcessed: "Chiến dịch sẽ được xử lý trên ChatGPT, Perplexity và Gemini",
  },
  lo: {
    brand: "ແບຣນ", agentStatus: "ສະຖານະຕົວແທນ", online: "ອອນລາຍ", lastSync: "ຊິງຄ໌ລ່າສຸດ",
    totalAIMentions: "ຈຳນວນການກ່າວເຖິງ AI ທັງໝົດ", days30: "30 ວັນ",
    positiveSentimentRatio: "ອັດຕາຄວາມຮູ້ສຶກໃນທາງບວກ",
    aboveIndustryAvg: "ສູງກວ່າຄ່າສະເລ່ຍອຸດສາຫະກຳ", competitorInterceptionRate: "ອັດຕາການສະກັດກັ້ນຂອງຄູ່ແຂ່ງ",
    queriesIntercepted: "ການຄົ້ນຫາທີ່ຖືກຄູ່ແຂ່ງສະກັດກັ້ນ",
    aiModelPerformanceMatrix: "ເມທຣິກປະສິດທິພາບຂອງໂມເດນ AI",
    brandVisibilityAcross: "ການເບິ່ງເຫັນແບຣນໃນແພລດຟອມ AI ຫຼັກ",
    brandSOVTrend: "ແນວໂນ້ມ SOV ຂອງແບຣນ", shareOfVoiceLast30Days: "ສ່ວນແບ່ງສຽງໃນ 30 ວັນທີ່ຜ່ານມາ",
    sovPercent: "SOV %", mentions: "ການກ່າວເຖິງ", liveIntelligenceFeed: "ຟີດຂ່າວກອງສົດ",
    realTimeAIAgentMonitoring: "ການຕິດຕາມຕົວແທນ AI ແບບເວລາຈິງຂ້າມແພລດຟອມ",
    live: "ສົດ", time: "ເວລາ", aiModel: "ໂມເດນ AI", sentiment: "ຄວາມຮູ້ສຶກ",
    intelligenceSummary: "ສະຫຼຸບຂ່າວກອງ", showingLatest: "ສະແດງລ່າສຸດ",
    intelligenceEvents: "ເຫດການຂ່າວກອງ", positive: "ບວກ", neutral: "ກາງ", negative: "ລົບ",
    createNewAEOCampaign: "ສ້າງແຄມເປນ AEO ໃໝ່",
    configureYourCampaign: "ກຳນົດຄ່າພາລາມິເຕີແຄມເປນການເພີ່ມປະສິດທິພາບ AI Engine",
    targetBrand: "ແບຣນເປົ້າໝາຍ", enterBrandName: "ປ້ອນຊື່ແບຣນ (ເຊັ່ນ: MEMECMO)",
    brandOptimizeDescription: "ແບຣນທີ່ທ່ານຕ້ອງການເພີ່ມປະສິດທິພາບສຳລັບເຄື່ອງຄົ້ນຫາ AI",
    questionSet: "ຊຸດຄຳຖາມ", bulkPaste: "ວາງແບບກຸ່ມ", fileUpload: "ອັບໂຫລດໄຟລ໌",
    enterOneQuestionPerLine: "ປ້ອນຄຳຖາມໜຶ່ງຂໍ້ຕໍ່ແຖວ ສູງສຸດ 20 ແຖວ", questions: "ຄຳຖາມ",
    dragAndDrop: "ລາກແລະວາງໄຟລ໌ທີ່ນີ້ ຫຼື", browse: "ເບິ່ງ",
    supportsCsvExcel: "ຮອງຮັບໄຟລ໌ CSV ແລະ Excel (.csv, .xlsx, .xls)",
    launchMatrixEngine: "ເປີດໃຊ້ເຄື່ອງມືເມທຣິກ",
    campaignWillBeProcessed: "ແຄມເປນຈະຖືກປະມວນຜົນໃນ ChatGPT, Perplexity ແລະ Gemini",
  },
  km: {
    brand: "ម៉ាក", agentStatus: "ស្ថានភាពភ្នាក់ងារ", online: "អនឡាញ", lastSync: "ធ្វើសមកាលកម្មចុងក្រោយ",
    totalAIMentions: "ការលើកឡើង AI សរុប", days30: "30 ថ្ងៃ", positiveSentimentRatio: "អត្រាអារម្មណ៍វិជ្ជមាន",
    aboveIndustryAvg: "ខ្ពស់ជាងមធ្យមភាគឧស្សាហកម្ម", competitorInterceptionRate: "អត្រាស្ទាក់ចាប់របស់គូប្រកួត",
    queriesIntercepted: "សំណួរដែលត្រូវបានស្ទាក់ចាប់ដោយគូប្រកួត",
    aiModelPerformanceMatrix: "ម៉ាទ្រីសប្រសិទ្ធភាពម៉ូដែល AI",
    brandVisibilityAcross: "ភាពមើលឃើញម៉ាកនៅលើវេទិកា AI សំខាន់ៗ",
    brandSOVTrend: "និន្នាការ SOV ម៉ាក", shareOfVoiceLast30Days: "ចំណែកសម្លេងក្នុង 30 ថ្ងៃចុងក្រោយ",
    sovPercent: "SOV %", mentions: "ការលើកឡើង", liveIntelligenceFeed: "ព័ត៌មានស៊ើបការណ៍បន្តផ្ទាល់",
    realTimeAIAgentMonitoring: "ការត្រួតពិនិត្យភ្នាក់ងារ AI ក្នុងពេលវេលាជាក់ស្តែងឆ្លងកាត់វេទិកា",
    live: "ផ្ទាល់", time: "ពេលវេលា", aiModel: "ម៉ូដែល AI", sentiment: "អារម្មណ៍",
    intelligenceSummary: "សង្ខេបស៊ើបការណ៍", showingLatest: "បង្ហាញចុងក្រោយបំផុត",
    intelligenceEvents: "ព្រឹត្តិការណ៍ស៊ើបការណ៍", positive: "វិជ្ជមាន", neutral: "អព្យាក្រឹត", negative: "អវិជ្ជមាន",
    createNewAEOCampaign: "បង្កើតយុទ្ធនាការ AEO ថ្មី",
    configureYourCampaign: "កំណត់រចនាសម្ព័ន្ធប៉ារ៉ាម៉ែត្រយុទ្ធនាការបង្កើនប្រសិទ្ធភាព AI Engine",
    targetBrand: "ម៉ាកគោលដៅ", enterBrandName: "បញ្ចូលឈ្មោះម៉ាក (ឧ. MEMECMO)",
    brandOptimizeDescription: "ម៉ាកដែលអ្នកចង់បង្កើនប្រសិទ្ធភាពសម្រាប់ម៉ាស៊ីនស្វែងរក AI",
    questionSet: "សំណុំសំណួរ", bulkPaste: "បិទភ្ជាប់ជាច្រើន", fileUpload: "ផ្ទុកឡើងឯកសារ",
    enterOneQuestionPerLine: "បញ្ចូលសំណួរមួយក្នុងមួយជួរ អតិបរមា 20 ជួរ", questions: "សំណួរ",
    dragAndDrop: "អូសនិងទម្លាក់ឯកសាររបស់អ្នកនៅទីនេះ ឬ", browse: "រុករក",
    supportsCsvExcel: "គាំទ្រឯកសារ CSV និង Excel (.csv, .xlsx, .xls)",
    launchMatrixEngine: "បើកដំណើរការម៉ាស៊ីនម៉ាទ្រីស",
    campaignWillBeProcessed: "យុទ្ធនាការនឹងត្រូវបានដំណើរការនៅលើ ChatGPT, Perplexity និង Gemini",
  },
  id: {
    brand: "Merek", agentStatus: "Status Agen", online: "Online", lastSync: "Sinkronisasi terakhir",
    totalAIMentions: "Total Penyebutan AI", days30: "30 hari", positiveSentimentRatio: "Rasio Sentimen Positif",
    aboveIndustryAvg: "Di atas rata-rata industri", competitorInterceptionRate: "Tingkat Intersepsi Pesaing",
    queriesIntercepted: "Kueri yang dicegat oleh pesaing",
    aiModelPerformanceMatrix: "Matriks Performa Model AI",
    brandVisibilityAcross: "Visibilitas merek di platform AI utama",
    brandSOVTrend: "Tren SOV Merek", shareOfVoiceLast30Days: "Share of Voice selama 30 hari terakhir",
    sovPercent: "SOV %", mentions: "Penyebutan", liveIntelligenceFeed: "Feed Intelijen Langsung",
    realTimeAIAgentMonitoring: "Pemantauan agen AI secara real-time di seluruh platform",
    live: "Langsung", time: "Waktu", aiModel: "Model AI", sentiment: "Sentimen",
    intelligenceSummary: "Ringkasan Intelijen", showingLatest: "Menampilkan terbaru",
    intelligenceEvents: "peristiwa intelijen", positive: "Positif", neutral: "Netral", negative: "Negatif",
    createNewAEOCampaign: "Buat Kampanye AEO Baru",
    configureYourCampaign: "Konfigurasikan parameter kampanye Optimasi AI Engine Anda",
    targetBrand: "Merek Target", enterBrandName: "Masukkan nama merek (mis., MEMECMO)",
    brandOptimizeDescription: "Merek yang ingin Anda optimalkan untuk mesin pencari AI",
    questionSet: "Set Pertanyaan", bulkPaste: "Tempel Massal", fileUpload: "Unggah File",
    enterOneQuestionPerLine: "Masukkan satu pertanyaan per baris, maksimal 20 baris", questions: "pertanyaan",
    dragAndDrop: "Seret dan lepas file Anda di sini, atau", browse: "jelajahi",
    supportsCsvExcel: "Mendukung file CSV dan Excel (.csv, .xlsx, .xls)",
    launchMatrixEngine: "Luncurkan Matrix Engine",
    campaignWillBeProcessed: "Kampanye akan diproses di ChatGPT, Perplexity, dan Gemini",
  },
  ms: {
    brand: "Jenama", agentStatus: "Status Ejen", online: "Dalam Talian", lastSync: "Penyegerakan terakhir",
    totalAIMentions: "Jumlah Sebutan AI", days30: "30 hari", positiveSentimentRatio: "Nisbah Sentimen Positif",
    aboveIndustryAvg: "Melebihi purata industri", competitorInterceptionRate: "Kadar Pintasan Pesaing",
    queriesIntercepted: "Pertanyaan yang dipintas oleh pesaing",
    aiModelPerformanceMatrix: "Matriks Prestasi Model AI",
    brandVisibilityAcross: "Keterlihatan jenama di platform AI utama",
    brandSOVTrend: "Trend SOV Jenama", shareOfVoiceLast30Days: "Bahagian Suara dalam 30 hari lepas",
    sovPercent: "SOV %", mentions: "Sebutan", liveIntelligenceFeed: "Suapan Perisikan Langsung",
    realTimeAIAgentMonitoring: "Pemantauan ejen AI masa nyata merentas platform",
    live: "Langsung", time: "Masa", aiModel: "Model AI", sentiment: "Sentimen",
    intelligenceSummary: "Ringkasan Perisikan", showingLatest: "Menunjukkan terkini",
    intelligenceEvents: "peristiwa perisikan", positive: "Positif", neutral: "Neutral", negative: "Negatif",
    createNewAEOCampaign: "Cipta Kempen AEO Baharu",
    configureYourCampaign: "Konfigurasikan parameter kempen Pengoptimuman AI Engine anda",
    targetBrand: "Jenama Sasaran", enterBrandName: "Masukkan nama jenama (cth., MEMECMO)",
    brandOptimizeDescription: "Jenama yang anda ingin optimumkan untuk enjin carian AI",
    questionSet: "Set Soalan", bulkPaste: "Tampal Pukal", fileUpload: "Muat Naik Fail",
    enterOneQuestionPerLine: "Masukkan satu soalan setiap baris, maksimum 20 baris", questions: "soalan",
    dragAndDrop: "Seret dan lepas fail anda di sini, atau", browse: "semak imbas",
    supportsCsvExcel: "Menyokong fail CSV dan Excel (.csv, .xlsx, .xls)",
    launchMatrixEngine: "Lancarkan Matrix Engine",
    campaignWillBeProcessed: "Kempen akan diproses merentas ChatGPT, Perplexity, dan Gemini",
  },
}

interface SovI18nContextType {
  language: SovLanguage
  setLanguage: (lang: SovLanguage) => void
  t: (key: SovTranslationKey) => string
}

const SovI18nContext = createContext<SovI18nContextType | null>(null)

export function SovI18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<SovLanguage>("zh")

  const t = (key: SovTranslationKey): string => {
    return translations[language][key] || translations.en[key] || key
  }

  return (
    <SovI18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </SovI18nContext.Provider>
  )
}

export function useSovI18n() {
  const context = useContext(SovI18nContext)
  if (!context) {
    throw new Error("useSovI18n must be used within a SovI18nProvider")
  }
  return context
}
