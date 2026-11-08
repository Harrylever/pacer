/**
 * JSON Schema sent to Gemini structured output. Deliberately looser than
 * IntentSchema (zod): the model fills type plus optional plan fields, and
 * zod remains the strict gate before anything uses the result.
 */
export const INTENT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: [
        'set_plan',
        'pause',
        'resume',
        'withdraw_all',
        'status',
        'history',
        'explain_options',
        'refuse_prediction',
        'faq',
        'greeting',
        'unknown',
      ],
      description: 'The intent type.',
    },
    dailyNgn: {
      type: 'number',
      description: 'For set_plan only: naira to save per day.',
    },
    topic: {
      type: 'string',
      enum: [
        'wallet_address',
        'deposit_address',
        'network',
        'change_address',
        'fees',
        'safety',
        'withdraw_how',
        'live_price',
        'how_it_works',
      ],
      description: 'For faq only: which question the user is asking.',
    },
    focus: {
      type: 'string',
      enum: ['SPYx', 'AAPLx', 'NVDAx'],
      description:
        'For history only: the one stock the user asked about, if exactly one.',
    },
    assets: {
      type: 'array',
      items: { type: 'string', enum: ['SPYx', 'AAPLx', 'NVDAx'] },
      description: 'For set_plan only: the stocks named by the user.',
    },
  },
  required: ['type'],
} as const;
