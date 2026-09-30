import { FetchClient, Config } from 'coze-coding-dev-sdk';

async function fetchDocuments() {
  const config = new Config();
  const client = new FetchClient(config);

  // Fetch second document
  const url2 = 'https://code.coze.cn/api/sandbox/coze_coding/file/proxy?expire_time=-1&file_path=assets%2F%E2%80%9C%E6%95%B0%E6%99%BA%E6%98%9F%E5%9B%BE%E2%80%9D%E6%95%B0%E6%8D%AE%E5%BA%93%E4%B8%8E%E5%90%8E%E7%AB%AF%E6%9C%8D%E5%8A%A1%E5%AE%8C%E6%95%B4%E8%AE%BE%E8%AE%A1.docx&nonce=e8ad129e-d8dd-4b9b-bbc3-10ebbc28d342&project_id=7624138675336593450&sign=ea6b6291cdf347a8bc1e4848068b5f2c2e77c7e2412327998cc87bac9abe6bce';
  
  console.log('=== Document 2: 数智星图数据库与后端服务完整设计 ===\n');
  const result2 = await client.fetch(url2);
  
  if (result2.content) {
    for (const item of result2.content) {
      if (item.type === 'text') {
        console.log(item.text);
      }
    }
  }
}

fetchDocuments().catch(console.error);
