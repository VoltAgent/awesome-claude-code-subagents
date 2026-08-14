## Privacy

> Last updated: Sep 15, 2025

Basics:

- Sign-in: You authenticate with your Hugging Face account.
- Conversation history: Stored so you can access past chats; you can delete any conversation at any time from the UI.

🗓 Please also consult huggingface.co's main privacy policy at <https://huggingface.co/privacy>. To exercise any of your legal privacy rights, please send an email to <privacy@huggingface.co>.

## Data handling and processing

HuggingChat uses Hugging Face’s Inference Providers to access models from multiple partners via a single API. Depending on the model and availability, inference runs with the corresponding provider.

- Inference Providers documentation: <https://huggingface.co/docs/inference-providers>
- Security & Compliance: <https://huggingface.co/docs/inference-providers/security>

Security and routing facts

- Hugging Face does not store any user data for training purposes.
- Hugging Face does not store the request body or the response when routing requests through Hugging Face.
- Logs are kept for debugging purposes for up to 30 days, but no user data or tokens are stored in those logs.
- Inference Provider routing uses TLS/SSL to encrypt data in transit.
- The Hugging Face Hub (which Inference Providers is a feature of) is SOC 2 Type 2 certified. See <https://huggingface.co/docs/hub/security>.

External providers are responsible for their own security and data handling. Please consult each provider’s respective security and privacy policies via the Inference Providers documentation linked above.

## Technical details

[![chat-ui](https://img.shields.io/github/stars/huggingface/chat-ui)](https://github.com/huggingface/chat-ui)

The app is completely open source, and further development takes place on the [huggingface/chat-ui](https://github.com/huggingface/chat-ui) GitHub repo. We're always open to contributions!

You can find the production configuration for HuggingChat [here](https://github.com/huggingface/chat-ui/blob/main/chart/env/prod.yaml).

HuggingChat connects to the OpenAI‑compatible Inference Providers router at `https://router.huggingface.co/v1` to access models across multiple providers. Provider selection may be automatic or fixed depending on the model configuration.

We welcome any feedback on this app: please participate in the public discussion at <https://huggingface.co/spaces/huggingchat/chat-ui/discussions>

<a target="_blank" href="https://huggingface.co/spaces/huggingchat/chat-ui/discussions"><img src="https://huggingface.co/datasets/huggingface/badges/raw/main/open-a-discussion-xl.svg" title="open a discussion"></a>
