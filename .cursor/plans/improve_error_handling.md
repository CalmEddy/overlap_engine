# Improve Error Handling for OpenAI API

## Current Issue
500 Internal Server Error when generating reports - need better error messages to diagnose the issue.

## Common Causes
1. Missing/invalid OpenAI API key
2. Invalid model name (e.g., "gpt-4" might not be available, need "gpt-4-turbo-preview" or "gpt-3.5-turbo")
3. OpenAI API response doesn't match expected schema
4. Network/API errors
5. JSON parsing errors

## Implementation Steps

### 1. Add Better Error Handling in lib/openai.ts
- Check if API key exists before making calls
- Wrap OpenAI API calls in try-catch with specific error messages
- Add validation for API responses
- Provide more detailed error messages for different failure scenarios

### 2. Improve Error Messages in API Route
- Return more specific error messages based on error type
- Include error details in development mode
- Log full error stack for debugging

### 3. Add Validation
- Validate API key format
- Validate model name
- Better handling of schema validation errors

## Files to Modify
- `lib/openai.ts` - Add comprehensive error handling
- `app/api/report/route.ts` - Improve error response messages

