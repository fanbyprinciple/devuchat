import React, { useRef, useState, useEffect } from 'react';
import './App.css';

import { supabase } from './supabaseClient';
import { LogIn, LogOut, Send, MessageSquare, ListTodo, CheckCircle, Circle, Trash2, PlusCircle, ShieldAlert } from 'lucide-react';

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [accessDenied, setAccessDenied] = useState(false);

  const ALLOWED_EMAIL = 'fanbyprinciple@gmail.com'; // YOUR GMAIL

  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      validateUser(session?.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      validateUser(session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const validateUser = (user) => {
    if (user) {
      if (user.email === ALLOWED_EMAIL) {
        setUser(user);
        setAccessDenied(false);
      } else {
        // Log out unauthorized users immediately
        supabase.auth.signOut();
        setUser(null);
        setAccessDenied(true);
      }
    } else {
      setUser(null);
    }
  };

  return (
    <div className="App">
      <header>
        <div className="header-content">
          <div className="brand">
            <MessageSquare size={24} className="logo-icon" />
            <h1>DevuChat</h1>
          </div>
          
          {user && (
            <nav className="tab-switcher">
              <button 
                className={activeTab === 'chat' ? 'active' : ''} 
                onClick={() => setActiveTab('chat')}
              >
                <MessageSquare size={18} />
                <span>Chat</span>
              </button>
              <button 
                className={activeTab === 'todo' ? 'active' : ''} 
                onClick={() => setActiveTab('todo')}
              >
                <ListTodo size={18} />
                <span>To-Do</span>
              </button>
            </nav>
          )}

          {user ? (
            <button className="sign-out-button" onClick={() => supabase.auth.signOut()}>
              <LogOut size={18} />
              Sign Out
            </button>
          ) : null}
        </div>
      </header>

      <section>
        {user ? (
          activeTab === 'chat' ? <ChatRoom user={user} /> : <TodoList user={user} />
        ) : (
          <SignIn accessDenied={accessDenied} />
        )}
      </section>
    </div>
  );
}

function SignIn({ accessDenied }) {
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/devuchat'
      }
    });
    if (error) console.error('Error signing in:', error.message);
  };

  return (
    <div className="sign-in-container">
      <div className="card">
        <h2>Private Access</h2>
        <p>This application is restricted to authorized users only.</p>
        
        {accessDenied && (
          <div className="error-banner">
            <ShieldAlert size={20} />
            <span>Access Denied: Unauthorized account.</span>
          </div>
        )}

        <button className="sign-in-button google-btn" onClick={signInWithGoogle}>
          <LogIn size={20} />
          Sign in with Google
        </button>
      </div>
    </div>
  );
}

function ChatRoom({ user }) {
  const dummy = useRef();
  const [messages, setMessages] = useState([]);
  const [formValue, setFormValue] = useState('');

  useEffect(() => {
    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);
      
      if (error) console.error('Error fetching messages:', error);
      else setMessages(data || []);
    };

    fetchMessages();

    const channel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    dummy.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!formValue.trim()) return;

    const { error } = await supabase
      .from('messages')
      .insert([
        { 
          text: formValue, 
          uid: user.id, 
          display_name: user.user_metadata.full_name || 'Devu',
          photo_url: user.user_metadata.avatar_url
        }
      ]);

    if (error) console.error('Error sending message:', error);
    setFormValue('');
  };

  return (
    <div className="chat-container">
      <main>
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.uid === user.id ? 'sent' : 'received'}`}>
            <img src={msg.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.uid}`} alt="avatar" />
            <div className="message-content">
              <span className="sender-name">{msg.display_name}</span>
              <p>{msg.text}</p>
            </div>
          </div>
        ))}
        <span ref={dummy}></span>
      </main>

      <form onSubmit={sendMessage} className="chat-form">
        <input 
          value={formValue} 
          onChange={(e) => setFormValue(e.target.value)} 
          placeholder="Type your message..." 
        />
        <button type="submit" disabled={!formValue.trim()}>
          <Send size={20} />
        </button>
      </form>
    </div>
  );
}

function TodoList({ user }) {
  const [todos, setTodos] = useState([]);
  const [todoText, setTodoText] = useState('');

  useEffect(() => {
    const fetchTodos = async () => {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('uid', user.id)
        .order('created_at', { ascending: false });

      if (error) console.error('Error fetching todos:', error);
      else setTodos(data || []);
    };

    fetchTodos();

    const channel = supabase
      .channel(`public:todos:uid=${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `uid=eq.${user.id}` }, payload => {
        if (payload.eventType === 'INSERT') {
          setTodos(prev => [payload.new, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setTodos(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
        } else if (payload.eventType === 'DELETE') {
          setTodos(prev => prev.filter(t => t.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  const addTodo = async (e) => {
    e.preventDefault();
    if (!todoText.trim()) return;

    const { error } = await supabase
      .from('todos')
      .insert([{ text: todoText, completed: false, uid: user.id }]);

    if (error) console.error('Error adding todo:', error);
    setTodoText('');
  };

  const toggleTodo = async (id, completed) => {
    const { error } = await supabase
      .from('todos')
      .update({ completed: !completed })
      .eq('id', id);
    if (error) console.error('Error toggling todo:', error);
  };

  const deleteTodo = async (id) => {
    const { error } = await supabase
      .from('todos')
      .delete()
      .eq('id', id);
    if (error) console.error('Error deleting todo:', error);
  };

  return (
    <div className="todo-container">
      <div className="todo-header">
        <h2>My Tasks</h2>
        <form onSubmit={addTodo} className="todo-form">
          <input 
            value={todoText} 
            onChange={(e) => setTodoText(e.target.value)} 
            placeholder="Add a new task..." 
          />
          <button type="submit" disabled={!todoText.trim()}>
            <PlusCircle size={24} />
          </button>
        </form>
      </div>

      <div className="todo-list">
        {todos.map(todo => (
          <div key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
            <button className="toggle-btn" onClick={() => toggleTodo(todo.id, todo.completed)}>
              {todo.completed ? <CheckCircle className="checked" size={24} /> : <Circle size={24} />}
            </button>
            <span className="todo-text">{todo.text}</span>
            <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>
              <Trash2 size={20} />
            </button>
          </div>
        ))}
        {todos.length === 0 && <p className="empty-state">No tasks yet. Add one above!</p>}
      </div>
    </div>
  );
}

export default App;
