import { useState, FormEvent } from 'react';

const providers = ['OpenAI', 'Anthropic', 'Gemini', 'Groq', 'Kimi / Moonshot'];
export function SettingsView() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  function save(event: FormEvent) {
    event.preventDefault();
    // Stub only: values remain in local component state. Never log secrets.
    console.info('Kite settings save stub invoked');
    setSaved(true);
  }
  return <main className="settings">
    <span className="eyebrow">KITE / PREFERENCES</span>
    <h1>A place for your keys.</h1>
    <p>Connect your preferred providers when voice features arrive.</p>
    <form onSubmit={save}>
      {providers.map((provider, index) => <label key={provider} htmlFor={`key-${index}`}>
        {provider}
        <input id={`key-${index}`} type="password" autoComplete="off" spellCheck={false}
          placeholder="Enter API key" value={keys[provider] ?? ''}
          onChange={event => { setKeys({ ...keys, [provider]: event.target.value }); setSaved(false); }} />
      </label>)}
      <div className="save-row"><button type="submit">Save</button>
        <span role="status">{saved ? 'Saved for this session only.' : 'Keys stay in this window for now.'}</span>
      </div>
    </form>
  </main>;
}
