function cleanLabel(value, fallback) {
  const label = String(value || fallback).replace(/\s+/g, ' ').trim();
  return label.replace(/[.!?]+$/, '');
}

export function interpretiveQuestions(kind, label) {
  const subject = cleanLabel(label, 'this theme');
  if (kind === 'gate') {
    return [
      {
        audience: 'Individual',
        text: `What role, if any, does ${subject} play in your day-to-day choices or experience? What specific moment helps you see that?`
      },
      {
        audience: 'Family',
        text: `What role, if any, does this theme play in a specific family interaction? What do the people involved say it meant to them?`
      }
    ];
  }

  if (kind === 'channel') {
    return [
      {
        audience: 'Individual',
        text: `How do the two sides of ${subject} meet in your own life, if at all? What conditions help them work together?`
      },
      {
        audience: 'Family',
        text: `In a specific family interaction around ${subject}, what did each person contribute, and how did each describe its effect?`
      }
    ];
  }

  if (kind === 'center') {
    return [
      {
        audience: 'Individual',
        text: `In your experience of ${subject}, what feels steady and what changes with context? What real example helps you tell?`
      },
      {
        audience: 'Family',
        text: `How does each family member describe their experience of ${subject}? What could you ask to understand their needs without assuming they match?`
      }
    ];
  }

  return [];
}
