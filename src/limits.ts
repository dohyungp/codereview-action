export class TokenLimits {
  maxTokens: number
  requestTokens: number
  responseTokens: number
  knowledgeCutOff: string

  constructor(model = 'gpt-5.2') {
    this.knowledgeCutOff = 'unknown'

    switch (model) {
      case 'gpt-5':
      case 'gpt-5.1':
      case 'gpt-5.2':
      case 'gpt-5.2-chat-latest':
      case 'gpt-5.3':
      case 'gpt-5-mini':
      case 'gpt-5-nano':
        this.maxTokens = 128000
        this.responseTokens = 8000
        break
      case 'gpt-4-turbo-preview':
        this.maxTokens = 128000
        this.responseTokens = 4000
        this.knowledgeCutOff = '2023-04-01'
        break
      case 'gpt-4':
        this.maxTokens = 8000
        this.responseTokens = 2000
        break
      case 'gpt-4-32k':
        this.maxTokens = 32600
        this.responseTokens = 4000
        break
      case 'gpt-3.5-turbo-16k':
        this.maxTokens = 16300
        this.responseTokens = 3000
        break
      default:
        if (model.startsWith('gpt-5')) {
          this.maxTokens = 128000
          this.responseTokens = 8000
        } else if (model.startsWith('gpt-4')) {
          this.maxTokens = 128000
          this.responseTokens = 4000
          this.knowledgeCutOff = '2023-04-01'
        } else {
          this.maxTokens = 4000
          this.responseTokens = 1000
        }
        break
    }
    // provide some margin for the request tokens
    this.requestTokens = this.maxTokens - this.responseTokens - 100
  }

  string(): string {
    return `max_tokens=${this.maxTokens}, request_tokens=${this.requestTokens}, response_tokens=${this.responseTokens}`
  }
}
