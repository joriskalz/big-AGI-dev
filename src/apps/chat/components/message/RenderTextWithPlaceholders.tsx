// RenderTextWithPlaceholders.tsx
import * as React from 'react';
import { Button, Chip, Typography } from '@mui/joy';
import CheckIcon from '@mui/icons-material/Check';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

interface RenderTextWithPlaceholdersProps {
  text: string;
  options: string[];
  selectedOptions: string[];
  onOptionSelected: (option: string) => void;
}

const RenderTextWithPlaceholders: React.FC<RenderTextWithPlaceholdersProps> = ({
  text,
  options,
  selectedOptions,
  onOptionSelected,
}) => {
  
  // Function to process the text and return an array of JSX elements
  const processText = (text: string, options: string[]) => {
    const elements: JSX.Element[] = [];
    let buffer = '';
    let isInsideCurlyBraces = false;

    // Iterate over each character in the text
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (char === '{') {
        // Encountered an opening curly brace
        isInsideCurlyBraces = true;
        buffer = char; // Start accumulating text inside curly braces
      } else if (char === '}' && isInsideCurlyBraces) {
        // Encountered a closing curly brace
        buffer += char;
        isInsideCurlyBraces = false;

        // Extract the text inside the curly braces
        const optionText = buffer.slice(1, -1);

        // Check if the accumulated text is an option
        if (options.includes(optionText)) {
          const isSelected = selectedOptions.includes(optionText);

          // Create a button for the option
          elements.push(
            <Button
            startDecorator={isSelected ? <CheckIcon /> : <RadioButtonUncheckedIcon />}
            variant="soft"
            color='primary'
            size="sm"
            sx={{
              mx: '0.15rem',
                my: '0.15rem',
              fontSize: 'inherit', // Use the same font size as surrounding text
              lineHeight: 'normal', // Use normal line height to match surrounding text
              verticalAlign: 'baseline', // Align the baseline of the chip with the text
            }}
            onClick={() => onOptionSelected(optionText)}
          >
            {optionText}
          </Button>
          );
        } else {
          // If not an option, render the text as is
          elements.push(<React.Fragment key={i}>{buffer}</React.Fragment>);
        }
        buffer = ''; // Reset the buffer
      } else if (isInsideCurlyBraces) {
        // Continue accumulating text inside curly braces
        buffer += char;
      } else {
        // Render text outside curly braces directly
        elements.push(<React.Fragment key={i}>{char}</React.Fragment>);
      }
    }

    // If there's any remaining text in the buffer after processing, it means we have an unmatched opening brace
    // We should not render that text, as it's not a valid placeholder
    return elements;
  };

  return (
    <Typography sx={{ mx: 1.5, alignItems: 'baseline', overflowWrap: 'anywhere', whiteSpace: 'break-spaces' }}>
      {processText(text, options)}
    </Typography>
  );};

export default RenderTextWithPlaceholders;