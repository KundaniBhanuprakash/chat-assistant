import { Sparkles, Code, Lightbulb, MessageSquare } from "lucide-react";

interface WelcomeScreenProps {
  onPromptClick: (prompt: string) => void;
}

const prompts = [
  {
    icon: Lightbulb,
    label: "Explain a concept",
    prompt: "Explain how machine learning works in simple terms",
  },
  {
    icon: Code,
    label: "Write code",
    prompt: "Write a Python function to sort a list of numbers",
  },
  {
    icon: MessageSquare,
    label: "Get advice",
    prompt: "What are best practices for writing clean code?",
  },
  {
    icon: Sparkles,
    label: "Be creative",
    prompt: "Help me brainstorm ideas for a mobile app",
  },
];

const WelcomeScreen = ({ onPromptClick }: WelcomeScreenProps) => {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 animate-slide-up">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-6">
          <Sparkles className="w-8 h-8 text-primary animate-pulse-glow" />
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold mb-3">
          <span className="text-gradient">Hello!</span>{" "}
          <span className="text-foreground">How can I help?</span>
        </h1>
        <p className="text-muted-foreground text-base max-w-md mx-auto">
          I'm your AI assistant. Ask me anything and I'll do my best to help you.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
        {prompts.map((item, index) => (
          <button
            key={index}
            onClick={() => onPromptClick(item.prompt)}
            className="group glass p-4 rounded-xl text-left transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                <item.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {item.prompt}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default WelcomeScreen;
