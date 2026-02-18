import './fetch-polyfill'

import {info, setFailed, warning} from '@actions/core'
import OpenAI from 'openai'
import pRetry from 'p-retry'
import {OpenAIOptions, Options} from './options'

export interface Ids {
  parentMessageId?: string
  conversationId?: string
  responseId?: string
}

interface OpenAIResponse {
  id?: string
  output_text?: string
  output?: Array<{
    type?: string
    content?: Array<{type?: string; text?: string}>
  }>
}

export class Bot {
  private readonly api: OpenAI
  private readonly options: Options
  private readonly systemMessage: string
  private readonly model: string
  private readonly maxOutputTokens: number

  constructor(options: Options, openaiOptions: OpenAIOptions) {
    this.options = options
    this.model = openaiOptions.model
    this.maxOutputTokens = openaiOptions.tokenLimits.responseTokens

    const currentDate = new Date().toISOString().split('T')[0]
    this.systemMessage = `${options.systemMessage}
Knowledge cutoff: ${openaiOptions.tokenLimits.knowledgeCutOff}
Current date: ${currentDate}

IMPORTANT: Entire response must be in the language with ISO code: ${options.language}
`

    if (process.env.OPENAI_API_KEY) {
      this.api = new OpenAI({
        baseURL: options.apiBaseUrl,
        apiKey: process.env.OPENAI_API_KEY,
        organization: process.env.OPENAI_API_ORG ?? undefined,
        timeout: options.openaiTimeoutMS,
        maxRetries: 0
      })
    } else {
      throw new Error(
        "Unable to initialize the OpenAI API, both 'OPENAI_API_KEY' environment variable are not available"
      )
    }
  }

  chat = async (message: string, ids: Ids): Promise<[string, Ids]> => {
    let res: [string, Ids] = ['', {}]
    try {
      res = await this.chat_(message, ids)
      return res
    } catch (e: unknown) {
      warning(`Failed to chat: ${e as string}`)
      return res
    }
  }

  private readonly chat_ = async (
    message: string,
    ids: Ids
  ): Promise<[string, Ids]> => {
    const start = Date.now()
    if (!message) {
      return ['', {}]
    }

    const previousResponseId = ids.responseId ?? ids.parentMessageId
    const requestPayload: Record<string, unknown> = {
      model: this.model,
      input: [
        {
          role: 'system',
          content: [{type: 'input_text', text: this.systemMessage}]
        },
        {
          role: 'user',
          content: [{type: 'input_text', text: message}]
        }
      ],
      // eslint-disable-next-line camelcase
      max_output_tokens: this.maxOutputTokens
    }
    if (previousResponseId) {
      // eslint-disable-next-line camelcase
      requestPayload.previous_response_id = previousResponseId
    }
    // Some modern models (e.g. gpt-5 family) reject temperature.
    if (!this.model.startsWith('gpt-5')) {
      requestPayload.temperature = this.options.openaiModelTemperature
    }

    let response: OpenAIResponse | undefined
    try {
      response = await pRetry(
        async () => await this.createResponse(requestPayload),
        {
          retries: this.options.openaiRetries
        }
      )
    } catch (e: unknown) {
      info(
        `response: ${JSON.stringify(
          response
        )}, failed to send message to openai: ${e as string}`
      )
    }

    const end = Date.now()
    info(`response: ${JSON.stringify(response)}`)
    info(
      `openai sendMessage (including retries) response time: ${end - start} ms`
    )

    let responseText = ''
    if (response != null) {
      responseText = this.extractResponseText(response)
    } else {
      setFailed('Failed to get a response from the OpenAI API')
      warning('openai response is null')
    }

    if (responseText.startsWith('with ')) {
      responseText = responseText.substring(5)
    }
    if (this.options.debug) {
      info(`openai responses: ${responseText}`)
    }

    const newIds: Ids = {
      parentMessageId: response?.id,
      responseId: response?.id
    }
    return [responseText, newIds]
  }

  private async createResponse(
    requestPayload: Record<string, unknown>
  ): Promise<OpenAIResponse> {
    return (await this.api.responses.create(
      requestPayload as unknown as Parameters<OpenAI['responses']['create']>[0]
    )) as unknown as OpenAIResponse
  }

  private extractResponseText(response: OpenAIResponse): string {
    if (typeof response.output_text === 'string' && response.output_text) {
      return response.output_text
    }

    const parts: string[] = []
    for (const item of response.output ?? []) {
      if (item.type !== 'message') {
        continue
      }
      for (const chunk of item.content ?? []) {
        if (
          (chunk.type === 'output_text' || chunk.type === 'text') &&
          typeof chunk.text === 'string'
        ) {
          parts.push(chunk.text)
        }
      }
    }

    return parts.join('\n').trim()
  }
}
