"use client";
import { AppLayout } from '@/components/AppLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Phone, Mail, Instagram, Linkedin, Twitter, MessageSquare, 
  Send, ShieldAlert, CheckCircle, ArrowUpRight, HelpCircle,
  FileText, Smartphone, Laptop
} from 'lucide-react';
import { useState } from 'react';

export default function ContactPage() {
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketMessage, setTicketMessage] = useState('');
  const [ticketType, setTicketType] = useState('Customization');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleSendTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitSuccess(true);
      setTicketSubject('');
      setTicketMessage('');
    }, 1800);
  };

  const contactMethods = [
    {
      name: 'WhatsApp & Mobile',
      value: '+91 6299019431',
      desc: 'Instant replies for urgent fixes, updates, or custom deployments.',
      icon: MessageSquare,
      color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 dark:bg-emerald-950/20 dark:border-emerald-900/40',
      actionLabel: 'Chat on WhatsApp',
      href: 'https://wa.me/916299019431?text=Hello%20Musharraf,%20I%20need%20assistance%20with%20the%20Pathology%20LIS%20system.',
      btnColor: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
    },
    {
      name: 'Email Address',
      value: 'mdmusharraf41125@gmail.com',
      desc: 'Send detailed requirements, screenshots, database queries, or logs.',
      icon: Mail,
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20 dark:bg-blue-950/20 dark:border-blue-900/40',
      actionLabel: 'Launch Mail Client',
      href: 'mailto:mdmusharraf41125@gmail.com?subject=Support%20Request%20-%20Pathology%20LIS',
      btnColor: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
    },
    {
      name: 'LinkedIn Profile',
      value: 'md-musharraf-dev',
      desc: 'Connect professionally or check out past project updates.',
      icon: Linkedin,
      color: 'bg-sky-500/10 text-sky-500 border-sky-500/20 dark:bg-sky-950/20 dark:border-sky-900/40',
      actionLabel: 'View Profile',
      href: 'https://linkedin.com/in/md-musharraf-dev',
      btnColor: 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-600/20'
    },
    {
      name: 'X (Twitter)',
      value: '@Mush_a_rraf',
      desc: 'Direct Message (DM) open for quick tech talk and updates.',
      icon: Twitter,
      color: 'bg-neutral-500/10 text-neutral-800 dark:text-neutral-200 border-neutral-500/20 dark:bg-neutral-950/20 dark:border-neutral-900/40',
      actionLabel: 'Open X Profile',
      href: 'https://x.com/Mush_a_rraf',
      btnColor: 'bg-neutral-800 hover:bg-neutral-950 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white shadow-neutral-500/10'
    },
    {
      name: 'Instagram',
      value: '@mush_a_rraf',
      desc: 'Follow or reach out for personal updates and messages.',
      icon: Instagram,
      color: 'bg-pink-500/10 text-pink-500 border-pink-500/20 dark:bg-pink-950/20 dark:border-pink-900/40',
      actionLabel: 'View Instagram',
      href: 'https://instagram.com/mush_a_rraf',
      btnColor: 'bg-pink-600 hover:bg-pink-700 text-white shadow-pink-600/20'
    }
  ];

  return (
    <AppLayout title="Contact Developer" breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Contact' }]}>
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Intro Banner */}
        <div className="relative rounded-2xl border bg-card/60 backdrop-blur-md p-6 overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="space-y-2 max-w-xl text-center md:text-left">
            <h2 className="text-2xl font-bold text-foreground">Need Customizations or Technical Support?</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              If you require a specific feature addition, database schema modification, custom PDF formatting, machine analyzer integrations (serial port), or want to report a bug, reach out to your developer directly.
            </p>
          </div>
          <div className="shrink-0 flex gap-3">
            <a 
              href="https://wa.me/916299019431" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all btn-primary-glow"
            >
              <Phone className="h-4 w-4" />
              Call / WhatsApp
            </a>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left: Contact Methods */}
          <div className="lg:col-span-7 space-y-4">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider pl-1">Direct Connection Methods</h3>
            {contactMethods.map((method, index) => (
              <motion.div 
                key={method.name}
                initial={{ opacity: 0, x: -15 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="group relative rounded-2xl border bg-card p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl border shrink-0 ${method.color}`}>
                    <method.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">{method.name}</h4>
                    <p className="font-mono text-xs text-primary font-semibold mt-0.5">{method.value}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-md">{method.desc}</p>
                  </div>
                </div>
                <a 
                  href={method.href} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`w-full sm:w-auto shrink-0 flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-all shadow-sm ${method.btnColor}`}
                >
                  {method.actionLabel}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </a>
              </motion.div>
            ))}
          </div>

          {/* Right: Simulated Support Form */}
          <div className="lg:col-span-5 space-y-4">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider pl-1">Send a Support Ticket</h3>
            <div className="rounded-2xl border bg-card p-6 shadow-sm relative overflow-hidden">
              
              <AnimatePresence mode="wait">
                {!submitSuccess ? (
                  <motion.form 
                    key="support-form"
                    onSubmit={handleSendTicket} 
                    className="space-y-4"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Issue Category</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['Customization', 'Bug Report', 'General'].map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setTicketType(type)}
                            className={`rounded-lg py-2 text-xs font-bold border transition-all ${
                              ticketType === type 
                                ? 'bg-primary text-primary-foreground border-primary' 
                                : 'bg-background hover:bg-accent text-foreground border-border'
                            }`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Subject</label>
                      <input 
                        type="text" 
                        required
                        value={ticketSubject}
                        onChange={e => setTicketSubject(e.target.value)}
                        placeholder="e.g. Need to integrate barcode scanner"
                        className="w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Detailed Description</label>
                      <textarea 
                        required
                        rows={4}
                        value={ticketMessage}
                        onChange={e => setTicketMessage(e.target.value)}
                        placeholder="Please detail your request. Include error messages or specific requirements if any..."
                        className="w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary border-border resize-none"
                      />
                    </div>

                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                      <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>Since this LIS runs in offline/local mode, tickets are simulated. Direct WhatsApp or Email is recommended for fast communication.</span>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting || !ticketSubject.trim() || !ticketMessage.trim()}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-all btn-primary-glow disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                            className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full"
                          />
                          Sending Ticket...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          Submit Ticket
                        </>
                      )}
                    </button>
                  </motion.form>
                ) : (
                  <motion.div 
                    key="success-message"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="py-10 text-center space-y-4"
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-green-500 mx-auto border border-green-500/20">
                      <CheckCircle className="h-7 w-7" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-base font-bold text-foreground">Ticket Generated Locally!</h4>
                      <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                        Your developer support ticket has been recorded in the local logs. For faster feedback, copy your ticket details and send them on WhatsApp or Email.
                      </p>
                    </div>
                    <button 
                      onClick={() => setSubmitSuccess(false)}
                      className="text-xs font-bold border rounded-lg px-4 py-2 hover:bg-accent text-foreground transition-colors"
                    >
                      Create Another Ticket
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>

        </div>

      </div>
    </AppLayout>
  );
}
