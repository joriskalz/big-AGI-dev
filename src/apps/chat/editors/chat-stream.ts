import { DLLMId } from '~/modules/llms/store-llms';
import { SystemPurposeId } from '../../../data';
import { autoSuggestions } from '~/modules/aifn/autosuggestions/autoSuggestions';
import { autoTitle } from '~/modules/aifn/autotitle/autoTitle';
import { llmStreamingChatGenerate } from '~/modules/llms/llm.client';
import { speakText } from '~/modules/elevenlabs/elevenlabs.client';

import { DMessage, useChatStore } from '~/common/state/store-chats';

import { ChatAutoSpeakType, getChatAutoAI } from '../store-app-chat';
import { createAssistantTypingMessage, updatePurposeInHistory } from './editors';


/**
 * The main "chat" function. TODO: this is here so we can soon move it to the data model.
 */
export async function runAssistantUpdatingState(conversationId: string, history: DMessage[], assistantLlmId: DLLMId, systemPurpose: SystemPurposeId) {

  // check if history contains less than 5 messages with the role 'user'
  const isFirstMessages = history.filter(m => m.role === 'user').length < 5;
  let prompt = '';


  if (isFirstMessages) {
    prompt = `
    You are an AI designed to assist users by engaging in a focused and supportive dialogue. 
    When a user presents a query, your task is to ask a clarifying question to gain additional insight into their needs. 

    RULES:
    Think of the 3 questions that could improve the level of understanding of the user's request.
    For each question, provide at least 4-5 most common options that the user could choose from.
    Offer potential responses as options in a consistent format: {Option1}, {Option2}, etc. 
    Sort the options from broad to specific, and include always "None of the above" options at the end.
    
    USER TOPIC:
    "${history[0].text}"

    ANSWER STRUCTURE:
    - Very short summary to start with.
    Question title 1: {Option1}, {Option2}, etc. \n
    Question title 2: {Option1}, {Option2}, etc. \n
    Question title 3: {Option1}, {Option2}, etc. \n

    ANSWER:
    `;

  } else {
    // Construct the standard prompt for non-first messages
    prompt = `... (standard prompt construction logic)`;
  }

        // You are an AI trained to assist users by asking clarifying questions. When a user asks a question, respond with a follow-up question to gather more information. Provide potential answers in the form of options enclosed in {optiontext1}, {optiontext2}, ...
      // Also act like a very good friend. Be empathetic and supportive. start broadly and then narrow down to the specifics. however, do not be to chaty.
      // Here is the user's question:
      // "${history[0].text}"
      // Based on this question, what follow-up question would you ask?


  // ai follow-up operations (fire/forget)
  const { autoSpeak, autoSuggestDiagrams, autoSuggestQuestions, autoTitleChat } = getChatAutoAI();

  // update the system message from the active Purpose, if not manually edited
  history = updatePurposeInHistory(conversationId, history, assistantLlmId, systemPurpose);

  // if isFirstMessage, override the system message with the prompt
  if (isFirstMessages && history[0].role === 'system')
    history[0].text = prompt;

  // create a blank and 'typing' message for the assistant
  const assistantMessageId = createAssistantTypingMessage(conversationId, assistantLlmId, history[0].purposeId, '...');

  // when an abort controller is set, the UI switches to the "stop" mode
  const controller = new AbortController();
  const { startTyping, editMessage } = useChatStore.getState();
  startTyping(conversationId, controller);


  console.log('🤖', 'streaming chat', { assistantLlmId, history, autoSpeak, autoSuggestDiagrams, autoSuggestQuestions, autoTitleChat });
  // stream the assistant's messages
  await streamAssistantMessage(
    assistantLlmId, history,
    autoSpeak,
    (updatedMessage) => editMessage(conversationId, assistantMessageId, updatedMessage, false),
    controller.signal,
  );

  // conversation is done, clear the abort controller
  controller.abort();

  // clear to send, again
  startTyping(conversationId, null);

  if (autoTitleChat)
    autoTitle(conversationId);

  if (autoSuggestDiagrams || autoSuggestQuestions)
    autoSuggestions(conversationId, assistantMessageId, autoSuggestDiagrams, autoSuggestQuestions);
}

// Function to parse the LLM's response and extract options with placeholders
function parseLLMResponse(responseText: string): { options: string[], placeholders: string[] } {
  const optionRegex = /\{(.*?)\}/g; // Adjusted regex to match your pattern
  let match;
  const options = [];
  const placeholders = [];
  let text = responseText;
  let placeholderIndex = 0;

  while ((match = optionRegex.exec(responseText)) !== null) {
    const optionText = match[1];
    const placeholder = `{{option_${placeholderIndex}}}`;
    placeholders.push(placeholder);
    options.push(optionText);
    text = text.replace(match[0], placeholder); // Replace the option markup with a placeholder
    placeholderIndex++;
  }

  return { options, placeholders };
}



async function streamAssistantMessage(
  llmId: DLLMId, history: DMessage[],
  autoSpeak: ChatAutoSpeakType,
  editMessage: (updatedMessage: Partial<DMessage>) => void,
  abortSignal: AbortSignal,
) {

  // speak once
  let spokenText = '';
  let spokenLine = false;

  const messages = history.map(({ role, text }) => ({ role, content: text }));

  try {
    await llmStreamingChatGenerate(llmId, messages, null, null, abortSignal,
      (updatedMessage: Partial<DMessage>) => {

        const { options, placeholders } = parseLLMResponse(updatedMessage.text || '');

        // Update the message with parsed text, options, and placeholders
        const messageToUpdate: Partial<DMessage> = {
          ...updatedMessage,
          options: options.length > 0 ? options : undefined,
          // Include placeholders if options are present
          placeholders: options.length > 0 ? placeholders : undefined,
        };


        // update the message in the store (and thus schedule a re-render)
        editMessage(messageToUpdate);

        // 📢 TTS: first-line
        if (updatedMessage?.text) {
          spokenText = updatedMessage.text;
          if (autoSpeak === 'firstLine' && !spokenLine) {
            let cutPoint = spokenText.lastIndexOf('\n');
            if (cutPoint < 0)
              cutPoint = spokenText.lastIndexOf('. ');
            if (cutPoint > 100 && cutPoint < 400) {
              spokenLine = true;
              const firstParagraph = spokenText.substring(0, cutPoint);

              // fire/forget: we don't want to stall this loop
              void speakText(firstParagraph);
            }
          }
        }
      },
    );
  } catch (error: any) {
    if (error?.name !== 'AbortError') {
      console.error('Fetch request error:', error);
      // TODO: show an error to the UI?
    }
  }

  // 📢 TTS: all
  if ((autoSpeak === 'all' || autoSpeak === 'firstLine') && spokenText && !spokenLine && !abortSignal.aborted)
    void speakText(spokenText);

  // finally, stop the typing animation
  editMessage({ typing: false });
}