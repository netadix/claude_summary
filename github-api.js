class GitHubAPI {
  constructor(config) {
    this.token = config.githubToken;
    this.user = config.githubUser;
    this.repo = config.githubRepo;
    this.branch = config.githubBranch;
    this.baseUrl = `https://api.github.com/repos/${this.user}/${this.repo}`;
  }

  async saveFile(path, content, message) {
    try {
      // ファイルが存在するか確認(SHA取得用)
      let sha = null;
      try {
        const existingFile = await fetch(`${this.baseUrl}/contents/${path}`, {
          headers: { 'Authorization': `token ${this.token}` }
        });
        if (existingFile.ok) {
          const data = await existingFile.json();
          sha = data.sha;
        }
      } catch (e) {
        // ファイルが存在しない場合は新規作成
      }

      // ファイルを保存
      const response = await fetch(`${this.baseUrl}/contents/${path}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message,
          content: btoa(unescape(encodeURIComponent(content))), // UTF-8 → Base64
          branch: this.branch,
          ...(sha && { sha }) // 既存ファイルの場合はSHA必須
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'GitHub API エラー');
      }

      return await response.json();
    } catch (error) {
      console.error('GitHub API エラー:', error);
      throw error;
    }
  }

async saveMemory(content, sessionId) { // ← 引数追加
  // トークン削除
  const sanitizedContent = content.replace(/ghp_[a-zA-Z0-9]{36}/g, '[TOKEN_REMOVED]');
  
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  // sessionId を引数から取得
  const chatId = sessionId || 'unknown';
  
  const filename = `${year}-${month}-${day}_${chatId}.md`;
  const folderPath = `memories/${year}-${month}`;
  const filePath = `${folderPath}/${filename}`;
  
  console.log(`📂 保存先: ${filePath}`);
  console.log(`🆔 セッションID: ${chatId}`);
  
  try {
    // 古いファイル削除
    await this.deleteOldSessionFiles(folderPath, chatId, filename);
    
    // 新しいファイル保存
    return await this.saveFile(
      filePath,
      sanitizedContent,
      `💾 記憶保存: ${year}-${month}-${day}`
    );
  } catch (error) {
    console.error('保存エラー:', error);
    throw error;
  }
}

  async deleteOldSessionFiles(folderPath, chatId, currentFilename) {
    try {
      // フォルダ内のファイル一覧取得
      const response = await fetch(`${this.baseUrl}/contents/${folderPath}`, {
        headers: { 'Authorization': `token ${this.token}` }
      });
      
      if (!response.ok) {
        // フォルダが存在しない場合は何もしない
        return;
      }
      
      const files = await response.json();
      
      // 同じセッションIDのファイルを探す
      const oldFiles = files.filter(file => {
        return file.name.endsWith(`_${chatId}.md`) && 
              file.name !== currentFilename;
      });
      
      // 古いファイルを削除
      for (const file of oldFiles) {
        console.log(`🗑️ 古いファイル削除: ${file.name}`);
        await fetch(`${this.baseUrl}/contents/${folderPath}/${file.name}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `token ${this.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `🗑️ 古いセッションファイル削除: ${file.name}`,
            sha: file.sha,
            branch: this.branch
          })
        });
      }
    } catch (error) {
      console.warn('古いファイル削除時のエラー(無視):', error);
      // エラーが出ても保存は続行
    }
  }

  async saveSummary(content) {
    return await this.saveFile(
      'summary.md',
      content,
      '📝 サマリー更新'
    );
  }
}