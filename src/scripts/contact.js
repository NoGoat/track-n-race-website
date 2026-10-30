// Privacy Policy: the contact email, shown once a Cloudflare Turnstile challenge is solved. worker/index.js checks the
// token and answers with the address, so it's in no page for scrapers to read. Turnstile's script loads only when
// the visitor asks for the email.
const row = document.getElementById('contactEmail');
if (row) {
    const reveal = row.querySelector('.privacy-contact-reveal');
    const challenge = row.querySelector('.privacy-contact-challenge');
    const link = row.querySelector('.privacy-contact-link');
    const status = row.querySelector('.privacy-contact-status');

    let turnstileReady = null;
    const loadTurnstile = () => turnstileReady ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = () => resolve(window.turnstile);
        // Forgotten, so the next click tries again
        script.onerror = () => {
            turnstileReady = null;
            script.remove();
            reject(new Error('Turnstile failed to load'));
        };
        document.head.append(script);
    });

    // Back to the button, with what went wrong read out
    const fail = (message) => {
        challenge.hidden = true;
        reveal.hidden = false;
        reveal.focus();
        status.textContent = message;
    };

    const showEmail = async (token) => {
        try {
            const response = await fetch('/api/contact', { method: 'POST', body: token });
            if (!response.ok) throw new Error(`Contact request failed: ${response.status}`);
            const { email } = await response.json();
            link.href = `mailto:${email}`;
            link.textContent = email;
            challenge.hidden = true;
            link.hidden = false;
            link.focus();
            status.textContent = '';
        } catch (error) {
            fail("Couldn't show the email. Please try again.");
            console.error(error);
        }
    };

    reveal.addEventListener('click', async () => {
        reveal.hidden = true;
        challenge.hidden = false;
        status.textContent = '';
        try {
            const turnstile = await loadTurnstile();
            // Its callbacks run later, never during render, so they can use widget
            const widget = turnstile.render(challenge, {
                sitekey: row.dataset.sitekey,
                // worker/index.js only accepts tokens for this action
                action: 'contact',
                theme: 'dark',
                callback: (token) => {
                    turnstile.remove(widget);
                    showEmail(token);
                },
                'error-callback': () => {
                    turnstile.remove(widget);
                    fail("The check couldn't run. Please try again.");
                    // Handled here, so Turnstile doesn't also log it
                    return true;
                },
            });
        } catch (error) {
            fail("The check couldn't load. Please try again.");
            console.error(error);
        }
    });
}
