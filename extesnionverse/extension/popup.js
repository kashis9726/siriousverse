// Holds text the user highlighted and right-clicked on, if any.
let selectedContext = null;

// On popup open, check whether a highlight-to-ask selection is waiting.
(async function loadPendingSelection() {
  const { pendingSelection } = await chrome.storage.local.get("pendingSelection");
  if (!pendingSelection) return;

  // Only use it if it's fresh (avoid stale selections from a previous session)
  // and it belongs to the tab that's currently active.
  const isFresh = Date.now() - pendingSelection.timestamp < 60_000; // 60s window
  if (!isFresh) {
    chrome.storage.local.remove("pendingSelection");
    return;
  }

  selectedContext = pendingSelection.text;
  chrome.storage.local.remove("pendingSelection");

  const queryInput = document.getElementById("userQuery");
  const responseBox = document.getElementById("responseBox");

  queryInput.placeholder = "Ask something about the highlighted text...";
  queryInput.focus();

  const preview = selectedContext.length > 140
    ? selectedContext.slice(0, 140) + "…"
    : selectedContext;

  responseBox.innerHTML = `
    <div style="color:#94a3b8; font-size:12.5px; padding:2px 2px 8px 2px;">
      📌 Using your selection as context:
    </div>
    <div style="color:#e2e8f0; font-size:12.5px; font-style:italic; border-left:2px solid #ff6b35; padding-left:8px;">
      "${preview}"
    </div>
  `;
})();

document.getElementById("askBtn").addEventListener("click", () => {
  const queryInput = document.getElementById("userQuery");
  const query = queryInput.value.trim();
  const askBtn = document.getElementById("askBtn");
  const responseBox = document.getElementById("responseBox");

  if (!query) return;

  // 1. Enter Loading State
  askBtn.disabled = true;
  askBtn.innerHTML = '<span class="loading"></span>Thinking...';
  responseBox.innerHTML = '<div style="color: #64748b; text-align: center; margin-top: 50px; font-style: italic;">Processing...</div>';

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabs[0].id },
        function: getPageContent
      },
      async (injectionResults) => {
        try {
          if (!injectionResults || !injectionResults[0]) {
            throw new Error("Could not extract page content. Try reloading the tab.");
          }

          const pageContent = injectionResults[0].result;

          const response = await fetch("http://127.0.0.1:8000/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              text: pageContent,
              query: query,
              session_id: tabs[0].id.toString(),
              selected_text: selectedContext || null
            })
          });

          if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
          }

          const data = await response.json();
          streamText(data.answer, responseBox);

          // Only prioritize the highlighted text for the first question.
          // Follow-ups in the same session go back to using the full page.
          selectedContext = null;
        } catch (error) {
          responseBox.innerHTML = `<div class="error-message">⚠️ Connection Error: ${error.message}. Please verify that your Python server is running on port 8000.</div>`;
        } finally {
          // 2. Reset Button State
          askBtn.disabled = false;
          askBtn.innerText = "Ask";
        }
      }
    );
  });
});

// Submit on Enter key (Shift + Enter goes to a new line)
document.getElementById("userQuery").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault(); // Stop default newline behavior
    document.getElementById("askBtn").click(); // Trigger button click logic
  }
});

function getPageContent() {
  return document.body.innerText;
}

// Simulates a typewriter/fade-in effect word by word
function streamText(text, container) {
  container.innerHTML = '<div class="response-text"></div>';
  const textHolder = container.querySelector(".response-text");
  
  // Split the response by spaces, preserving newlines
  const words = text.split(/(\s+)/);
  let wordIndex = 0;

  function printNextWord() {
    if (wordIndex < words.length) {
      const word = words[wordIndex];
      
      if (word.trim() === "") {
        // It's a space or newline, append it directly
        textHolder.appendChild(document.createTextNode(word));
      } else {
        // Create a span with the animation class
        const span = document.createElement("span");
        span.className = "word";
        span.innerText = word;
        textHolder.appendChild(span);
      }
      
      wordIndex++;
      
      // Auto-scroll to the bottom as new words appear
      container.scrollTop = container.scrollHeight;
      
      // Control typing speed (40ms delay between words)
      setTimeout(printNextWord, 40);
    }
  }
  
  printNextWord();
}
