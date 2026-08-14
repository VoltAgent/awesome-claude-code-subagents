# Helm

<Tip warning={true}>

The Helm chart is a work in progress and should be considered unstable. Breaking changes may be pushed without migration guides. Contributions welcome!

</Tip>

For Kubernetes deployment, use the Helm chart in `/chart`. No chart repository is published, so clone the repository and install by path.

## Installation

```bash
git clone https://github.com/huggingface/chat-ui
cd chat-ui
helm install chat-ui ./chart -f values.yaml
```

## Example values.yaml

```yaml
replicas: 1

domain: example.com

service:
  type: ClusterIP

resources:
  requests:
    cpu: 100m
    memory: 2Gi
  limits:
    cpu: "4"
    memory: 6Gi

envVars:
  OPENAI_BASE_URL: https://router.huggingface.co/v1
  OPENAI_API_KEY: hf_***
  MONGODB_URL: mongodb://chat-ui-mongo:27017
```

See the [configuration overview](../configuration/overview) for all available environment variables.
