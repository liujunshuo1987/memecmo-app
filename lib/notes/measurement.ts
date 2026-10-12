// Measurement notes — what a client needs in order to read the numbers in the
// weekly report and on the dashboard: what changed in the instrument, when a
// number counts as having moved, how a number is produced, and which method
// comes next. Public and generic on purpose: no client, no client figure.
//
// Every statement about the platform maps to running code (lib/engines/ingest,
// lib/agents/serp, lib/agents/monitor, lib/reports/digest). The paired-predicate
// method is NOT run by this platform yet and the page says so; it is
// NeuronSpark's (观澜智库) instrument, used by MemeCMO under licence.

import { NOTES_PATH, NOTES_STANDARD_PDF, type NotesLang } from './paths';
export { NOTES_PATH, NOTES_STANDARD_PDF, type NotesLang };

export type NotesBlock =
  | { t: 'p'; text: string }
  | { t: 'status'; text: string }
  | { t: 'dl'; items: { term: string; text: string }[] }
  | { t: 'ol' | 'ul'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] };

export interface Notes {
  htmlLang: string;
  title: string;
  subtitle: string;
  updated: string;
  sections: { id: string; h: string; blocks: NotesBlock[] }[];
  standard: string;
  method: { label: string; url: string };
  footer: string;
}

export const NOTES_UPDATED = '2026-10-11';

const vi: Notes = {
  htmlLang: 'vi',
  title: 'Ghi chú đo lường · tháng 10/2026',
  subtitle:
    'Trang này giải thích các con số trong báo cáo tuần và trên nền tảng được tạo ra thế nào, những thay đổi nào không nên hiểu là thay đổi của thương hiệu, và phương pháp đo mới sẽ được bổ sung.',
  updated: 'Cập nhật 11/10/2026',
  sections: [
    {
      id: 'october',
      h: '1. Tháng 10 có gì thay đổi trong phép đo',
      blocks: [
        {
          t: 'dl',
          items: [
            {
              term: 'Perplexity: câu trả lời mở đầu bằng nhật ký tìm kiếm',
              text:
                'Từ lần quét ngày 02/10, mỗi câu trả lời của Perplexity mở đầu bằng nhật ký tìm kiếm của chính engine (từ khóa và các nguồn tìm được). Phần chấm điểm đọc phần đầu câu trả lời, nên ở các lần quét định kỳ ngày 02/10 và 09/10, mức nổi bật, sắc thái (cảm xúc) và tỷ lệ xuất hiện của Perplexity được chấm trên nhật ký này chứ không phải trên nội dung câu trả lời. Lỗi được sửa ngày 09/10. Hai lần quét đó được đánh dấu * trong báo cáo và không được dùng để kết luận tăng hay giảm; lần quét định kỳ đầu tiên sau khi sửa là mốc mới cho Perplexity.',
            },
            {
              term: 'Google AI Overview: câu trả lời không thu được từng bị tính là "không xuất hiện"',
              text:
                'Với nhiều câu hỏi, Google tạo phần tổng quan AI sau khi trang kết quả đã tải, và nội dung phải được lấy bằng một yêu cầu thứ hai. Trước ngày 11/10, hai yêu cầu dùng chung một giới hạn 30 giây; khi quá giờ hoặc không lấy được, câu trả lời bị lưu là trống và được tính là thương hiệu không xuất hiện. Từ ngày 11/10, mỗi yêu cầu có giới hạn thời gian riêng, có thử lại một lần, và mỗi câu trả lời được ghi rõ một trong ba kết quả: đã có câu trả lời, Google không hiển thị tổng quan AI, hoặc không thu được. Vì thu được nhiều câu trả lời hơn, số đo của Google AI Overview từ lần quét đầu tiên sau ngày 11/10 chưa hoàn toàn so sánh được với các lần trước; báo cáo ghi chú điều này một lần.',
            },
            {
              term: 'Perplexity liệt kê ít nguồn hơn',
              text:
                'Cũng từ đầu tháng 10, Perplexity liệt kê ít nguồn hơn hẳn trong mỗi câu trả lời: khoảng 5 nguồn, so với 25–30 trước đó (đo trên một bộ câu hỏi tiếng Việt). Đây là thay đổi của chính engine. Số lượt trích dẫn và danh sách nguồn của Perplexity trước và sau thời điểm này không so sánh được với nhau.',
            },
          ],
        },
      ],
    },
    {
      id: 'movement',
      h: '2. Khi nào một con số được coi là đã thay đổi',
      blocks: [
        { t: 'p', text: 'Báo cáo chỉ gọi một thay đổi là tăng hay giảm khi đáp ứng các quy tắc sau.' },
        {
          t: 'ol',
          items: [
            'Chỉ so sánh các lần quét định kỳ: cùng bộ câu hỏi, cùng các engine, cùng thời điểm trong tuần. Lần quét thủ công được ghi riêng và không dùng để so sánh.',
            'Điểm tổng thay đổi trong khoảng ±3 là nhiễu lấy mẫu. Báo cáo ghi con số, không gọi là tăng hay giảm.',
            'Lần quét bị đánh dấu — chấm sai đối tượng, một engine không trả về phần lớn câu trả lời, hoặc nhà cung cấp đổi mô hình — không được dùng để kết luận. Lần quét hợp lệ tiếp theo là mốc mới.',
            'Một câu hỏi "có" hay "không có" thương hiệu trong một lần quét chưa phải là thay đổi. Cùng một câu hỏi, hỏi lại sau vài giờ có thể cho kết quả khác: trong một lần kiểm tra, 11 câu hỏi được hỏi ba lần trong một buổi tối và 3 câu cho kết quả không giống nhau giữa các lần. Chỉ kết quả lặp lại qua nhiều lần quét mới được coi là ổn định.',
            'Không ai chỉnh tay các số đo. Khi công cụ đo có lỗi, chúng tôi sửa công cụ, giữ nguyên số đã ghi và đánh dấu nó.',
          ],
        },
      ],
    },
    {
      id: 'layers',
      h: '3. Con số được tạo ra thế nào',
      blocks: [
        { t: 'p', text: 'Mỗi lần quét đi qua bốn lớp. Chỉ một lớp có phán đoán của mô hình AI; phần tính điểm dùng quy tắc.' },
        {
          t: 'dl',
          items: [
            {
              term: 'Lớp hỏi',
              text:
                'Bộ câu hỏi cố định bằng tiếng Việt được gửi đến năm engine: ChatGPT, Claude, Gemini, Perplexity và Google AI Overview. Bốn engine đầu được hỏi qua giao diện lập trình của mô hình, nên câu trả lời có thể khác với ứng dụng trên điện thoại của người dùng. Google AI Overview được lấy từ trang kết quả tìm kiếm thật.',
            },
            { term: 'Lớp thu câu trả lời', text: 'Câu trả lời được lưu nguyên văn. Phần nhật ký làm việc của engine, nếu có, được tách ra trước khi chấm.' },
            {
              term: 'Lớp đọc',
              text:
                'Một mô hình ngôn ngữ đọc phần đầu của mỗi câu trả lời và ghi lại bốn điều: thương hiệu có được nhắc đến không, nổi bật đến mức nào, với sắc thái nào, và những thương hiệu nào khác được nhắc. Đây là lớp duy nhất có phán đoán của mô hình; nó được đối chiếu với một bộ mẫu do người gán nhãn.',
            },
            {
              term: 'Lớp tính điểm',
              text:
                'Điểm AIGVR là một công thức cố định: tỷ lệ xuất hiện 30%, mức nổi bật 25%, thị phần tiếng nói so với đối thủ 20%, sắc thái 15%, trích dẫn 10%. Không có mô hình nào tham gia ở lớp này, nên có thể tính lại từ cùng dữ liệu.',
            },
          ],
        },
        {
          t: 'p',
          text:
            'Trong báo cáo tuần, Phần 1 là số đo. Phần 2 (diễn giải) và Phần 3 (gợi ý) do AI viết; từng luận điểm được đối chiếu với dữ liệu quét và câu nào không kiểm chứng được sẽ bị loại. Hai phần này không làm thay đổi số đo ở Phần 1.',
        },
        {
          t: 'p',
          text:
            'Về "mô hình ra quyết định": lớp đọc hiện dùng mô hình hội thoại đa dụng. Một loại mô hình mới, trả về xác suất thay vì văn bản, đang xuất hiện; chúng rẻ hơn và đo được mức "không chắc chắn" chi tiết hơn. Chúng tôi đang đánh giá loại mô hình này. Thay mô hình ở lớp đọc là thay đổi phương pháp: chỉ thực hiện khi mô hình mới đạt mức nhất quán yêu cầu so với bộ mẫu do người gán nhãn, và được thông báo trong báo cáo của kỳ đó.',
        },
      ],
    },
    {
      id: 'paired',
      h: '4. Phương pháp mới: kiểm chứng bằng cặp mệnh đề',
      blocks: [
        { t: 'status', text: 'Chưa áp dụng cho các dự án tiếng Việt' },
        { t: 'p', text: 'Tỷ lệ xuất hiện đếm tên thương hiệu, không đo điều AI "tin" về thương hiệu. Một thương hiệu có thể được nhắc thường xuyên mà vẫn bị nói sai.' },
        {
          t: 'p',
          text:
            'Phương pháp này lấy một khẳng định trong tài liệu thương hiệu đã công bố, viết câu phủ định trực tiếp của nó, rồi hỏi engine từng câu trong hai lần hỏi tách biệt: câu này đúng hay sai? Engine chỉ được trả lời có, không hoặc không chắc, kèm một câu căn cứ. Hai câu trả lời ghép lại cho một trong bốn kết quả. Mỗi bộ câu được hỏi ít nhất hai lượt; nếu hai lượt cho kết quả khác nhau thì ghi kết quả thứ năm.',
        },
        {
          t: 'table',
          head: ['Kết quả', 'Hai câu trả lời', 'Ý nghĩa đối với nội dung'],
          rows: [
            ['Nhất quán', 'Đồng ý với khẳng định, không đồng ý với câu phủ định', 'AI nói giống điều thương hiệu công bố.'],
            ['Trái ngược', 'Không đồng ý với khẳng định, đồng ý với câu phủ định', 'Một cách nói ngược lại đang mạnh hơn cách nói của thương hiệu.'],
            ['Tự mâu thuẫn', 'Đồng ý với cả hai câu', 'Hai cách nói ngang sức; AI chưa có nhận định ổn định.'],
            ['Khoảng trống', 'Không đồng ý hoặc không chắc với cả hai câu', 'Thương hiệu đã viết, nhưng không ở nơi AI đọc được.'],
            ['Không ổn định giữa các lượt', 'Hai lượt hỏi cho hai kết quả khác nhau', 'AI chưa có lập trường ổn định về khẳng định này. Không dùng biểu quyết đa số để che kết quả này.'],
          ],
        },
        {
          t: 'ul',
          items: [
            'Hai câu phải được hỏi riêng. Hỏi chung một cuộc hội thoại, engine sẽ cố giữ cho hai câu trả lời khớp nhau.',
            'Mỗi lượt có câu đối chứng không liên quan đến thương hiệu, một nửa là câu sai đã biết. Engine đồng ý với câu sai thì toàn bộ kết quả của engine trong lượt đó bị hủy.',
            'Khẳng định ghép hai ý phải được tách ra, mỗi ý hỏi riêng.',
          ],
        },
        {
          t: 'p',
          text:
            'Phương pháp không chấm "điểm chính xác". Chấm điểm chính xác đòi hỏi một trọng tài biết sự thật, mà sự thật về một doanh nghiệp nằm trong tài liệu doanh nghiệp tự công bố, không nằm ở chúng tôi hay ở một mô hình. Phương pháp chỉ quan sát hai điều: AI có nói giống điều thương hiệu công bố không, và AI có tự nhất quán không.',
        },
        {
          t: 'p',
          text:
            'Giới hạn: phương pháp không phán định đúng sai; nó đo câu trả lời lấy qua giao diện lập trình của mô hình; và mỗi thương hiệu chỉ có khoảng mười mấy khẳng định, đủ để chỉ ra câu nào cần bổ sung nguồn kiểm chứng, chưa đủ để kết luận chung về một engine.',
        },
        {
          t: 'p',
          text:
            'Phương pháp do NeuronSpark (观澜智库, Hồng Kông) phát triển và công bố; MemeCMO sử dụng theo giấy phép. Phương pháp đã được đo thực tế trên một thương hiệu mẫu tại Hồng Kông, bằng tiếng Trung. Để áp dụng cho một dự án tiếng Việt, cần bộ câu hỏi và câu đối chứng bằng tiếng Việt, cùng một danh sách khẳng định chỉ lấy từ tài liệu thương hiệu đã công bố và được chính thương hiệu xác nhận.',
        },
      ],
    },
    {
      id: 'help',
      h: '5. Hai việc giúp phép đo phản ánh đúng công sức của Quý công ty',
      blocks: [
        { t: 'p', text: 'MemeCMO không đăng nội dung lên bất kỳ AI nào. AI chỉ đọc các trang web công khai. Những gì ghi hoặc chỉnh sửa trên nền tảng (hồ sơ thương hiệu, bản nháp, bản ghi hành động) chỉ thay đổi bản ghi và gợi ý của chúng tôi; muốn AI nhìn thấy, nội dung phải được đăng trên website hoặc báo chí.' },
        {
          t: 'ul',
          items: [
            'Ghi lại mỗi nội dung đã đăng (liên kết và ngày đăng). Không có bản ghi này, báo cáo không thể nối một bài viết với một thay đổi trong câu trả lời của AI.',
            'Xác nhận bảng dữ kiện chuẩn của thương hiệu. Đây cũng là danh sách khẳng định cho phương pháp cặp mệnh đề.',
          ],
        },
      ],
    },
  ],
  standard: 'Tiêu chuẩn đo lường v1.1 (PDF)',
  method: { label: 'Bài mô tả phương pháp cặp mệnh đề (NeuronSpark, tiếng Anh)', url: 'https://www.neuronsparkmedia.com/en/methods/paired-predicates' },
  footer: 'Các số đo tuân theo Tiêu chuẩn đo lường MemeCMO v1.1. Những thay đổi nêu ở mục 1 sẽ được đưa vào phiên bản tiếp theo của tiêu chuẩn. Trang này không chứa số liệu của bất kỳ khách hàng nào.',
};

const zh: Notes = {
  htmlLang: 'zh-Hans',
  title: '测量说明 · 2026 年 10 月',
  subtitle: '这一页说明周报和平台上的数字是怎么得出来的，哪些变化不应理解为品牌表现的变化，以及接下来会加入的新测量方法。',
  updated: '更新于 2026-10-11',
  sections: [
    {
      id: 'october',
      h: '1. 10 月测量上发生了什么',
      blocks: [
        {
          t: 'dl',
          items: [
            {
              term: 'Perplexity：回答开头多了一段搜索记录',
              text:
                '从 10 月 2 日的扫描起，Perplexity 的每条回答开头都带有它自己的搜索记录（搜索词和找到的来源）。判分读的是回答的开头，所以 10 月 2 日和 10 月 9 日两次排程扫描里，Perplexity 的显著度、情感和出现率是对着这段记录判的，不是对着回答正文。问题已于 10 月 9 日修正。这两次扫描在报告里标有 *，不用来判断涨跌；修正后的第一次排程扫描是 Perplexity 的新基线。',
            },
            {
              term: 'Google AI Overview：没取回的回答曾被记成"未出现"',
              text:
                '很多问题的 AI 概览是 Google 在结果页加载之后才生成的，正文要靠第二次请求去取。10 月 11 日之前，两次请求共用 30 秒时限；超时或取不到时，回答被存成空，并按"品牌未出现"计分。10 月 11 日起，两次请求各自计时，失败重试一次，每条回答记下三种结果之一：有回答、Google 没有显示 AI 概览、没取回。因为取回的回答变多了，10 月 11 日之后第一次扫描起，Google AI Overview 的读数与此前不完全可比；报告会注明一次。',
            },
            {
              term: 'Perplexity 列出的来源变少了',
              text:
                '同样从 10 月初起，Perplexity 每条回答列出的来源大幅减少：约 5 个，此前是 25–30 个（在一组越南语问题上测得）。这是引擎自身的变化。Perplexity 的引用次数和来源清单，在这个时间点前后不能互相比较。',
            },
          ],
        },
      ],
    },
    {
      id: 'movement',
      h: '2. 什么时候才算一个数字"变了"',
      blocks: [
        { t: 'p', text: '报告只在满足下面几条规则时，才把一个变化称为上升或下降。' },
        {
          t: 'ol',
          items: [
            '只比较排程扫描：同一组问题、同一组引擎、每周同一时间。手动扫描单独列出，不参与比较。',
            '总分在 ±3 以内的变化是抽样噪声。报告只写数字，不称为涨或跌。',
            '被标记的扫描——判分读错了对象、某个引擎的大部分回答没取回、或供应商更换了模型——不用来下结论。下一次有效扫描是新基线。',
            '某个问题在一次扫描里"有"或"没有"品牌，还不算变化。同一个问题隔几小时再问，结果可能不同：在一次检查中，11 个问题一晚上问了三遍，有 3 个问题三遍的结果不一致。只有多次扫描都重复出现的结果才算稳定。',
            '没有人手动调整测量数字。测量工具出错时，我们修工具，已记录的数字保留并标注。',
          ],
        },
      ],
    },
    {
      id: 'layers',
      h: '3. 数字是怎么得出来的',
      blocks: [
        { t: 'p', text: '每次扫描经过四层。只有一层含有 AI 模型的判断；计分用的是规则。' },
        {
          t: 'dl',
          items: [
            {
              term: '提问层',
              text:
                '固定的一组越南语问题发给五个引擎：ChatGPT、Claude、Gemini、Perplexity 和 Google AI Overview。前四个通过模型接口提问，回答可能与用户手机上的应用不同。Google AI Overview 取自真实的搜索结果页。',
            },
            { term: '取回层', text: '回答原文保存。引擎自己的工作记录（如果有）在判分前剥离。' },
            {
              term: '判读层',
              text: '一个语言模型阅读每条回答的开头，记下四件事：是否提到品牌、位置有多显著、语气如何、还提到了哪些品牌。这是唯一含有模型判断的一层；它用一组人工标注的样本来校验。',
            },
            { term: '计分层', text: 'AIGVR 是一条固定公式：出现率 30%、显著度 25%、相对竞品的声量份额 20%、情感 15%、引用 10%。这一层没有模型参与，可以用同样的数据重新算出来。' },
          ],
        },
        { t: 'p', text: '周报里，第一部分是测量数字。第二部分（解读）和第三部分（建议）由 AI 撰写；每条论断都对照扫描数据核验，核验不了的句子会被删掉。这两部分不改变第一部分的数字。' },
        {
          t: 'p',
          text:
            '关于"决策模型"：判读层目前用的是通用对话模型。一类输出概率而不是文字的新模型正在出现，它们更便宜，也能把"不确定"量得更细。我们正在评估。更换判读层的模型属于方法变更：只有新模型在人工标注样本上达到要求的一致性才会更换，并在当期报告里说明。',
        },
      ],
    },
    {
      id: 'paired',
      h: '4. 新方法：成对谓词核验',
      blocks: [
        { t: 'status', text: '尚未用于越南语项目' },
        { t: 'p', text: '出现率数的是品牌的名字，量不出 AI 对品牌"信什么"。一个品牌可以被频繁提到，同时被说错。' },
        {
          t: 'p',
          text:
            '这个方法取品牌已公开材料里的一条声明，写出它的直接否定，然后在两次互不相干的提问里分别问引擎：这句话对不对？引擎只能回答是、否或不确定，并给一句依据。两个回答的组合落在四种结果之一。每组问题至少问两轮；两轮结果不同，就记为第五种结果。',
        },
        {
          t: 'table',
          head: ['结果', '两个回答', '对内容工作意味着什么'],
          rows: [
            ['一致', '同意声明，不同意否定句', 'AI 的说法与品牌公开的说法一致。'],
            ['矛盾', '不同意声明，同意否定句', '有一个相反的说法比品牌自己的说法更强势。'],
            ['自相矛盾', '两句都同意', '两种说法势均力敌，AI 没有稳定的认知。'],
            ['真空', '两句都不同意或不确定', '品牌写了，但没有写在 AI 读得到的地方。'],
            ['轮间不稳', '两轮提问得到不同结果', 'AI 对这条声明没有稳定立场。不用多数表决来掩盖这个结果。'],
          ],
        },
        {
          t: 'ul',
          items: [
            '两句必须分开问。放在同一次对话里，引擎会刻意让两个回答保持一致。',
            '每一轮都混入与品牌无关的对照句，其中一半是已知为假的。对假句答"是"的引擎，这一轮的全部结果作废。',
            '包含两层意思的声明必须拆开，每层意思单独问。',
          ],
        },
        {
          t: 'p',
          text: '这个方法不打"准确度分"。准确度打分需要一个知道真相的裁判，而一家公司的事实在它自己公开的材料里，不在我们手里，也不在某个模型手里。方法只观察两件事：AI 的说法与品牌公开的说法是否一致，AI 自己前后是否自洽。',
        },
        { t: 'p', text: '局限：它不裁定真假；它量的是通过模型接口取得的回答；一个品牌只有十几条声明，足以指出哪几句话需要补上可查证的出处，不足以对一个引擎下总体结论。' },
        {
          t: 'p',
          text:
            '方法由观澜智库（NeuronSpark，香港）开发并发布，MemeCMO 获授权使用。它已在香港的一个示范品牌上用中文实测。用于越南语项目之前，需要越南语的问法和对照句，以及一份只取自品牌已公开材料、并由品牌自己确认的声明清单。',
        },
      ],
    },
    {
      id: 'help',
      h: '5. 两件事能让测量更如实地反映贵方的工作',
      blocks: [
        { t: 'p', text: 'MemeCMO 不向任何 AI 发布内容。AI 只读公开的网页。在平台上登记或修改的东西(品牌档案、草稿、行动记录)只改变我们的记录和建议;要让 AI 看到,内容必须发布在官网或媒体上。' },
        {
          t: 'ul',
          items: [
            '登记每一篇已发布的内容（链接和发布日期）。没有这条记录，报告无法把一篇稿件和 AI 回答里的一个变化连起来。',
            '确认品牌的标准事实表。它同时也是成对谓词方法要用的声明清单。',
          ],
        },
      ],
    },
  ],
  standard: '测量标准 v1.1（PDF）',
  method: { label: '成对谓词方法说明（观澜智库）', url: 'https://www.neuronsparkmedia.com/zh-cn/methods/paired-predicates' },
  footer: '各项测量遵循 MemeCMO 测量标准 v1.1。第 1 节所述的变化将写入标准的下一个版本。本页不含任何客户的数据。',
};

const en: Notes = {
  htmlLang: 'en',
  title: 'Measurement notes · October 2026',
  subtitle:
    'How the numbers in the weekly report and on the platform are produced, which changes should not be read as changes in the brand, and the measurement method that comes next.',
  updated: 'Updated 11 October 2026',
  sections: [
    {
      id: 'october',
      h: '1. What changed in the measurement in October',
      blocks: [
        {
          t: 'dl',
          items: [
            {
              term: 'Perplexity: answers open with a search log',
              text:
                "Since the scan of 2 October, every Perplexity answer opens with the engine's own search log (its query and the sources it found). Scoring reads the opening of an answer, so in the scheduled scans of 2 and 9 October the prominence, sentiment and presence of Perplexity were scored on that log, not on the answer. This was corrected on 9 October. Those two scans are marked * in reports and are not used to call a rise or a fall; the first scheduled scan after the correction is the new baseline for Perplexity.",
            },
            {
              term: 'Google AI Overview: answers that were not retrieved used to count as "absent"',
              text:
                'For many questions Google generates the AI Overview after the results page has loaded, and its text has to be fetched with a second request. Before 11 October the two requests shared one 30-second limit; when it ran out, or the text could not be fetched, the answer was stored as empty and scored as the brand being absent. Since 11 October each request has its own limit, a failed one is retried once, and every answer is recorded as one of three outcomes: answered, no AI Overview shown, or not retrieved. Because more answers now come back, the Google AI Overview reading from the first scan after 11 October is not fully comparable with earlier scans; reports say so once.',
            },
            {
              term: 'Perplexity lists fewer sources',
              text:
                "Also since early October, Perplexity lists far fewer sources per answer: about 5, against 25–30 before (measured on one Vietnamese question panel). This is the engine's own change. Perplexity's citation counts and source lists before and after that date cannot be compared with each other.",
            },
          ],
        },
      ],
    },
    {
      id: 'movement',
      h: '2. When a number counts as having moved',
      blocks: [
        { t: 'p', text: 'A report calls a change a rise or a fall only when these rules are met.' },
        {
          t: 'ol',
          items: [
            'Only scheduled scans are compared: the same questions, the same engines, the same time of the week. Scans run by hand are listed separately and never compared.',
            'A change of the overall score within ±3 is sampling noise. The report prints the number and does not call it a rise or a fall.',
            'A marked scan — scored on the wrong text, an engine that did not return most of its answers, or a provider that changed its model — is not used for conclusions. The next valid scan is the new baseline.',
            'A question that "has" or "does not have" the brand in one scan is not yet a change. Asked again a few hours later, the same question can come out differently: in one check, 11 questions were asked three times in one evening and 3 of them did not give the same result each time. Only a result that repeats across scans is treated as stable.',
            'Nobody adjusts a measured number by hand. When the instrument is at fault we repair the instrument, keep the recorded number and mark it.',
          ],
        },
      ],
    },
    {
      id: 'layers',
      h: '3. How a number is produced',
      blocks: [
        { t: 'p', text: 'Every scan passes through four layers. Only one of them contains the judgement of an AI model; scoring is done by rule.' },
        {
          t: 'dl',
          items: [
            {
              term: 'Asking',
              text:
                "A fixed panel of questions in Vietnamese is put to five engines: ChatGPT, Claude, Gemini, Perplexity and Google AI Overview. The first four are asked through the model's programming interface, so an answer can differ from the app on a user's phone. Google AI Overview is taken from the real search results page.",
            },
            { term: 'Retrieving', text: "Answers are stored in full. An engine's own working log, where there is one, is removed before scoring." },
            {
              term: 'Reading',
              text:
                'A language model reads the opening of each answer and records four things: whether the brand is mentioned, how prominently, in what tone, and which other brands are mentioned. This is the only layer with a model judgement; it is checked against a set of answers labelled by people.',
            },
            {
              term: 'Scoring',
              text:
                'AIGVR is a fixed formula: presence 30%, prominence 25%, share of voice against competitors 20%, sentiment 15%, citation 10%. No model takes part in this layer, so the score can be recomputed from the same data.',
            },
          ],
        },
        {
          t: 'p',
          text:
            'In the weekly report, Part 1 is the measurement. Part 2 (interpretation) and Part 3 (suggestions) are written by AI; every claim is checked against the scan and a sentence that cannot be verified is removed. Neither part changes the numbers in Part 1.',
        },
        {
          t: 'p',
          text:
            'On "decision models": the reading layer currently uses a general-purpose conversational model. A newer kind of model, which returns probabilities instead of text, is appearing; it is cheaper and measures "not sure" more finely. We are evaluating it. Replacing the model in the reading layer is a change of method: it happens only when the new model reaches the required agreement with the answers labelled by people, and it is declared in the report for that period.',
        },
      ],
    },
    {
      id: 'paired',
      h: '4. A new method: paired-predicate verification',
      blocks: [
        { t: 'status', text: 'Not yet applied to Vietnamese-language projects' },
        { t: 'p', text: 'Presence counts the brand\'s name; it does not measure what AI "believes" about the brand. A brand can be mentioned often and still be described wrongly.' },
        {
          t: 'p',
          text:
            "This method takes a claim from the brand's own published material, writes its direct negation, and puts each sentence to the engine in two separate requests: is this statement correct? The engine may answer only yes, no or unsure, with one sentence of basis. The pair of answers gives one of four outcomes. Each set is asked at least twice; when the two rounds differ, the fifth outcome is recorded.",
        },
        {
          t: 'table',
          head: ['Outcome', 'The two answers', 'What it means for content'],
          rows: [
            ['Aligned', 'Agrees with the claim, not with its negation', 'AI says what the brand publishes.'],
            ['Contradicted', 'Does not agree with the claim, agrees with its negation', "An opposite account is stronger than the brand's own."],
            ['Incoherent', 'Agrees with both', 'Two accounts are evenly matched; AI has no settled view.'],
            ['Vacuum', 'Agrees with neither, or is unsure about both', 'The brand wrote it, but not where AI reads.'],
            ['Unstable across rounds', 'Two rounds give two different outcomes', 'AI has no settled position on this claim. A majority vote is never used to hide it.'],
          ],
        },
        {
          t: 'ul',
          items: [
            'The two sentences are asked separately. In one conversation the engine keeps its two answers consistent on purpose.',
            'Every round includes control sentences unrelated to the brand, half of them known to be false. An engine that agrees with a false one has all its results for that round discarded.',
            'A claim that carries two facts is split, and each fact is asked on its own.',
          ],
        },
        {
          t: 'p',
          text:
            "The method gives no \"accuracy score\". An accuracy score needs a referee who knows the truth, and the truth about a company is in the material the company itself publishes, not with us and not with a model. The method observes two things only: whether AI says what the brand publishes, and whether AI is consistent with itself.",
        },
        {
          t: 'p',
          text:
            "Limits: it does not decide what is true; it measures answers obtained through the model's programming interface; and a brand has a dozen or so claims, enough to show which sentences need a verifiable source, not enough for a general conclusion about an engine.",
        },
        {
          t: 'p',
          text:
            "The method was developed and published by NeuronSpark (观澜智库, Hong Kong); MemeCMO uses it under licence. It has been run on a demonstration brand in Hong Kong, in Chinese. Before it is applied to a Vietnamese-language project it needs Vietnamese questions and controls, and a list of claims taken only from the brand's published material and confirmed by the brand.",
        },
      ],
    },
    {
      id: 'help',
      h: "5. Two things that let the measurement reflect your team's work",
      blocks: [
        { t: 'p', text: 'MemeCMO does not publish content to any AI. AI reads public web pages only. What is logged or edited on the platform (the brand profile, drafts, the record of actions) changes our records and suggestions and nothing else; for AI to see something, it has to be published on your website or in the media.' },
        {
          t: 'ul',
          items: [
            'Log every piece of content you publish (link and date). Without that record a report cannot connect an article to a change in what AI answers.',
            "Confirm the brand's reference facts. The same list is the claim set for the paired-predicate method.",
          ],
        },
      ],
    },
  ],
  standard: 'Measurement Standard v1.1 (PDF)',
  method: { label: 'Paired-predicate method note (NeuronSpark)', url: 'https://www.neuronsparkmedia.com/en/methods/paired-predicates' },
  footer: "Measurements follow the MemeCMO Measurement Standard v1.1. The changes in section 1 will be written into the next version of the standard. This page contains no client's data.",
};

export const NOTES: Record<NotesLang, Notes> = { vi, zh, en };
